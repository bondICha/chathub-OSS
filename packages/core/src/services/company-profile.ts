import Browser from 'webextension-polyfill'

export interface CompanyProfilePreset {
  companyName: string
  checkUrl: string
  logoUrl?: string
  templateData: any
  version: string
}

export enum CompanyProfileStatus {
  UNCONFIRMED = 'unconfirmed',
  IMPORTED = 'imported',
  REJECTED = 'rejected'
}

export interface CompanyProfileState {
  companyName: string
  version: string
  status: CompanyProfileStatus
  lastChecked: number
  checkCount: number // Track how many times we've checked this version
}

// Sample configuration for company profiles. 
// Create a separate company-profiles-config.ts file with your actual settings.
export const COMPANY_PROFILE_PRESETS: CompanyProfilePreset[] = [
  {
    companyName: 'ExampleCompany',
    checkUrl: 'https://internal.example.com/',
    version: '1.0.0',
    templateData: {
      "customApiConfigs": [],
      "customApiHost": "https://api.example.com"
    }
  }
]

// Function to get actual configuration, fallback to sample if not available
async function loadCompanyProfiles(): Promise<CompanyProfilePreset[]> {
  try {
    const { COMPANY_PROFILE_CONFIGS } = await import('../../config/company-profiles')
    return COMPANY_PROFILE_CONFIGS
  } catch {
    // Fallback to sample configuration if company-profiles.ts doesn't exist in src/config/
    return COMPANY_PROFILE_PRESETS
  }
}

export async function getCompanyProfileConfigs(): Promise<CompanyProfilePreset[]> {
  return await loadCompanyProfiles()
}

export async function findCompanyPresetByUrl(url: string): Promise<CompanyProfilePreset | undefined> {
  const configs = await getCompanyProfileConfigs()
  return configs.find(preset => preset.checkUrl === url)
}

export async function findCompanyPresetByName(companyName: string): Promise<CompanyProfilePreset | undefined> {
  const configs = await getCompanyProfileConfigs()
  return configs.find(preset => preset.companyName === companyName)
}

export async function getCompanyProfileState(companyName: string): Promise<CompanyProfileState | null> {
  try {
    const result = await Browser.storage.local.get(`companyProfile_${companyName}`)
    return result[`companyProfile_${companyName}`] || null
  } catch {
    return null
  }
}

export async function setCompanyProfileState(state: CompanyProfileState): Promise<void> {
  try {
    await Browser.storage.local.set({
      [`companyProfile_${state.companyName}`]: state
    })
  } catch (error) {
    console.error('Failed to save company profile state:', error)
  }
}

export function compareVersions(version1: string, version2: string): number {
  // Simple string comparison for date-based versions (e.g., "2025.09.30-claude-4-5")
  // This works because date format YYYY.MM.DD naturally sorts correctly
  if (version1 === version2) return 0
  return version1 > version2 ? 1 : -1
}

export async function shouldCheckCompanyProfile(preset: CompanyProfilePreset): Promise<boolean> {
  // Import the existing app open times function
  const { getAppOpenTimes } = await import('~services/storage/open-times')
  const openTimes = await getAppOpenTimes()
  const state = await getCompanyProfileState(preset.companyName)
  
  // Only check company profile during the first 3 app launches
  if (openTimes <= 3) {
    return true
  }
  
  // If there's a new version of the company profile, always check
  if (state && compareVersions(preset.version, state.version) > 0) {
    return true
  }
  
  return false
}

export async function shouldShowProfilePrompt(preset: CompanyProfilePreset): Promise<boolean> {
  const state = await getCompanyProfileState(preset.companyName)
  
  if (!state) {
    return true // 初回
  }
  
  if (state.status === CompanyProfileStatus.UNCONFIRMED) {
    return true // 「もう一度Popupする」が選択されていた場合
  }
  
  if (compareVersions(preset.version, state.version) > 0) {
    return true // 新しいバージョンがある場合
  }
  
  return false
}

// CRITICAL: DO NOT MODIFY THIS VALIDATION LOGIC
// This function MUST only return true for HTTP 200 status codes
// DO NOT accept 302, 301, or any other status codes - this will break company profile detection
export async function checkCompanyProfile(internalUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 1000)

    const response = await fetch(internalUrl, {
      signal: controller.signal,
      method: 'HEAD',
      redirect: 'manual', // Don't follow redirects automatically
    })

    clearTimeout(timeoutId)

    // CRITICAL: Only accept HTTP 200 status code
    // With host_permissions in manifest, we can now read the actual status code
    return response.status === 200
  } catch {
    return false // Network error or redirect/other status codes will throw
  }
}