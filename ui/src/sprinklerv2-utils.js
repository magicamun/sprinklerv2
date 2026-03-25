console.log("Module Utils loaded");
export function isAdmin(hass) {
  return hass?.user?.is_admin === true;
}
