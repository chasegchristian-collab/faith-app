/* Live sync settings. Leave both empty to keep the app local-only (manual file sync still works).
   supabaseUrl:     your project URL, e.g. 'https://abcdefghijkl.supabase.co'
   supabaseAnonKey: the project's public "anon" key (safe to publish; the database only allows
                    the pull/push functions, which need your couple code). Never put the service_role key here. */
window.FAITH_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: ''
};
