/** Fail closed: production and previews of every other branch stay unmarked. */
export function isStagingDeployment(environment: string | undefined, branch: string | undefined): boolean {
  return environment === "preview" && branch === "staging";
}
