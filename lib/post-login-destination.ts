export function postLoginDestination(role: string | undefined) {
  return role === "admin" ? "/operator/mfa" : "/dashboard";
}
