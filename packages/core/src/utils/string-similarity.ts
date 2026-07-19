/**
 * Calculate similarity between two strings using normalized Levenshtein distance
 * Returns a value between 0 (completely different) and 1 (identical)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  // Normalize strings: remove extra whitespace, trim
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()

  const s1 = normalize(str1)
  const s2 = normalize(str2)

  // Handle edge cases
  if (s1 === s2) return 1
  if (s1.length === 0 || s2.length === 0) return 0

  // Calculate Levenshtein distance
  const matrix: number[][] = []

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  const distance = matrix[s2.length][s1.length]
  const maxLength = Math.max(s1.length, s2.length)

  // Convert distance to similarity (0-1)
  return 1 - (distance / maxLength)
}

/**
 * Check if current prompt is similar to any of the default prompts
 * Returns the maximum similarity score found
 */
export function checkPromptSimilarity(
  currentPrompt: string,
  defaultPrompts: Record<string, string>
): number {
  const similarities = Object.values(defaultPrompts).map(defaultPrompt =>
    calculateStringSimilarity(currentPrompt, defaultPrompt)
  )

  return Math.max(...similarities)
}
