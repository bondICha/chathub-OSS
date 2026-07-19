import Browser from 'webextension-polyfill'
import {
  MIGRATION_STATUS_KEY,
  MigrationState,
  SESSION_ENTITY_KEY,
  AIO_ENTITY_KEY,
  SESSION_INDEX_KEY,
  SessionIndexV2,
} from './chat-history'

interface SessionSnapshot {
  sessionUUID: string
  createdAt: number
  lastUpdated: number
  botIndices: number[]
  layout: string
  pairName?: string
  conversations: { [botIndex: number]: any[] }
  totalMessageCount: number
}

interface AllInOneSession {
  id: string
  createdAt: number
  lastUpdated: number
  botIndices: number[]
  layout: string
  pairName?: string
  conversationSnapshots?: { [botIndex: number]: string }
}

export class StorageMigrationService {
  private static CHUNK_SIZE = 50 // Process 50 sessions per batch

  async startMigration(): Promise<void> {
    console.log('[Migration] Starting storage migration to V2...')

    // 1. Set migration status to running
    await this.setStatus('running', { migratedCount: 0, totalCount: 0 })

    try {
      // 2. Load old data once
      const [snapshots, aioSessions] = await Promise.all([
        this.loadOldSnapshots(),
        this.loadOldAllInOne()
      ])

      const totalCount = snapshots.length + aioSessions.length
      console.log(`[Migration] Total sessions to migrate: ${totalCount} (${snapshots.length} snapshots + ${aioSessions.length} AIO)`)

      await this.updateTotalCount(totalCount)

      // 3. Migrate in chunks
      await this.migrateSnapshotsInChunks(snapshots)
      await this.migrateAllInOneInChunks(aioSessions)

      // 4. Build new index
      console.log('[Migration] Building session index V2...')
      await this.buildIndexV2()

      // 5. Verify migration
      console.log('[Migration] Verifying migration...')
      const verified = await this.verifyMigration(totalCount)

      if (verified) {
        console.log('[Migration] ✅ Migration completed successfully!')
        await this.setStatus('completed')
      } else {
        throw new Error('Verification failed: session count mismatch')
      }
    } catch (error) {
      console.error('[Migration] ❌ Migration failed:', error)
      await this.setStatus('error', {
        error: { message: error instanceof Error ? error.message : 'Unknown error', phase: 'migration' }
      })
      throw error
    }
  }

  private async loadOldSnapshots(): Promise<SessionSnapshot[]> {
    const key = 'sessionSnapshots'
    const { [key]: snapshots = [] } = await Browser.storage.local.get(key)
    return snapshots
  }

  private async loadOldAllInOne(): Promise<AllInOneSession[]> {
    const key = 'allInOneSessions'
    const { [key]: sessions = [] } = await Browser.storage.local.get(key)
    return sessions
  }

  private async migrateSnapshotsInChunks(snapshots: SessionSnapshot[]): Promise<void> {
    console.log(`[Migration] Migrating ${snapshots.length} session snapshots...`)

    for (let i = 0; i < snapshots.length; i += StorageMigrationService.CHUNK_SIZE) {
      const chunk = snapshots.slice(i, i + StorageMigrationService.CHUNK_SIZE)

      // Build batch object for chrome.storage.local.set()
      const batchData: Record<string, any> = {}

      for (const session of chunk) {
        const key = SESSION_ENTITY_KEY(session.sessionUUID)
        batchData[key] = session
      }

      // Single storage.set() call for entire chunk
      await Browser.storage.local.set(batchData)

      // Update progress
      await this.incrementMigratedCount(chunk.length)

      // Notify UI
      this.notifyProgress(i + chunk.length, snapshots.length, 'snapshots')
    }
  }

  private async migrateAllInOneInChunks(aioSessions: AllInOneSession[]): Promise<void> {
    console.log(`[Migration] Migrating ${aioSessions.length} All-in-One sessions...`)

    for (let i = 0; i < aioSessions.length; i += StorageMigrationService.CHUNK_SIZE) {
      const chunk = aioSessions.slice(i, i + StorageMigrationService.CHUNK_SIZE)

      // Build batch object for chrome.storage.local.set()
      const batchData: Record<string, any> = {}

      for (const session of chunk) {
        const key = AIO_ENTITY_KEY(session.id)
        batchData[key] = session
      }

      // Single storage.set() call for entire chunk
      await Browser.storage.local.set(batchData)

      // Update progress
      await this.incrementMigratedCount(chunk.length)

      // Notify UI
      this.notifyProgress(i + chunk.length, aioSessions.length, 'aio')
    }
  }

  private async buildIndexV2(): Promise<void> {
    // Build lightweight index from all v2 entity keys
    const index: SessionIndexV2 = {
      version: 2,
      lastUpdated: Date.now(),
      sessions: []
    }

    // Collect all session keys
    const allKeys = await this.getAllV2EntityKeys()
    console.log(`[Migration] Building index from ${allKeys.length} entity keys...`)

    for (const key of allKeys) {
      const result = await Browser.storage.local.get(key)
      const session = result[key]

      if (!session) continue

      const id = this.extractIdFromKey(key)
      const type = this.extractTypeFromKey(key)

      index.sessions.push({
        id,
        type,
        lastUpdated: session.lastUpdated || session.createdAt || Date.now(),
        messageCount: session.totalMessageCount || session.messageCount || 0,
        searchPreview: this.buildSearchPreview(session),
        botIndices: session.botIndices
      })
    }

    // Sort by lastUpdated (descending)
    index.sessions.sort((a, b) => b.lastUpdated - a.lastUpdated)

    console.log(`[Migration] Index built with ${index.sessions.length} sessions`)
    await Browser.storage.local.set({ [SESSION_INDEX_KEY]: index })
  }

  private async getAllV2EntityKeys(): Promise<string[]> {
    const allStorage = await Browser.storage.local.get(null)
    const keys = Object.keys(allStorage)

    // Filter only v2 entity keys
    return keys.filter(key =>
      key.startsWith('session:snap:v2:') ||
      key.startsWith('session:aio:v2:')
    )
  }

  private extractIdFromKey(key: string): string {
    // Extract UUID/ID from keys like "session:snap:v2:uuid" or "session:aio:v2:id"
    const parts = key.split(':')
    return parts[parts.length - 1]
  }

  private extractTypeFromKey(key: string): 'snap' | 'aio' | 'single' {
    if (key.startsWith('session:snap:v2:')) return 'snap'
    if (key.startsWith('session:aio:v2:')) return 'aio'
    return 'single'
  }

  private buildSearchPreview(session: any): string {
    // Build preview string from first user message
    const conversations = session.conversations || {}
    const allMessages = Object.values(conversations).flat() as any[]

    const firstUserMsg = allMessages.find((m: any) =>
      m && m.author === 'user' && typeof m.text === 'string' && m.text.trim() !== ''
    )

    const preview = firstUserMsg?.text || session.pairName || ''
    return preview.substring(0, 200)
  }

  private async verifyMigration(expectedCount: number): Promise<boolean> {
    const result = await Browser.storage.local.get(SESSION_INDEX_KEY)
    const index = result[SESSION_INDEX_KEY] as SessionIndexV2 | undefined

    const actualCount = index?.sessions.length || 0
    console.log(`[Migration] Verification: Expected ${expectedCount}, Got ${actualCount}`)

    return actualCount === expectedCount
  }

  private async setStatus(
    status: MigrationState['status'],
    partial?: Partial<MigrationState>
  ): Promise<void> {
    const now = Date.now()
    const current = await this.getStatus()

    const newState: MigrationState = {
      status,
      startedAt: current?.startedAt || now,
      updatedAt: now,
      totalCount: current?.totalCount || 0,
      migratedCount: current?.migratedCount || 0,
      ...partial
    }

    await Browser.storage.local.set({ [MIGRATION_STATUS_KEY]: newState })
  }

  private async getStatus(): Promise<MigrationState | null> {
    const result = await Browser.storage.local.get(MIGRATION_STATUS_KEY)
    return result[MIGRATION_STATUS_KEY] || null
  }

  private async updateTotalCount(totalCount: number): Promise<void> {
    const current = await this.getStatus()
    if (current) {
      await this.setStatus(current.status, { totalCount })
    }
  }

  private async incrementMigratedCount(increment: number): Promise<void> {
    const current = await this.getStatus()
    if (current) {
      await this.setStatus(current.status, {
        migratedCount: current.migratedCount + increment
      })
    }
  }

  private notifyProgress(current: number, total: number, type: string): void {
    console.log(`[Migration] Progress (${type}): ${current}/${total}`)
  }

  // Check if migration is needed
  static async isMigrationNeeded(): Promise<boolean> {
    const result = await Browser.storage.local.get(MIGRATION_STATUS_KEY)
    const status = result[MIGRATION_STATUS_KEY] as MigrationState | undefined

    // Migration needed if not completed
    return !status || status.status !== 'completed'
  }

  // Check migration status
  static async getMigrationStatus(): Promise<MigrationState | null> {
    const result = await Browser.storage.local.get(MIGRATION_STATUS_KEY)
    return result[MIGRATION_STATUS_KEY] || null
  }
}
