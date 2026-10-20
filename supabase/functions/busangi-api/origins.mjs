// Explicitly owned production aliases; never trust arbitrary *.vercel.app hosts
// or client-supplied forwarding headers for authorization.
export function allowedOrigins(configured='') {
 return new Set([
  'https://busangikiwoom.vercel.app',
  'https://busangikiwoom-git-main-ljg9809-7416.vercel.app',
  ...configured.split(',').map(value=>value.trim()).filter(Boolean)
 ]);
}
