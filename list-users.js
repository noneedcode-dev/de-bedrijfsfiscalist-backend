// list-users.js - List all app_users from Supabase with auth info
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function listAppUsers() {
  console.log('🔍 Fetching app_users from Supabase...\n');

  // Fetch app_users
  const { data: appUsers, error: appError } = await supabase
    .from('app_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (appError) {
    console.error('❌ Error fetching app_users:', appError.message);
    process.exit(1);
  }

  // Fetch auth users (from Supabase Auth)
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

  if (authError) {
    console.error('❌ Error fetching auth users:', authError.message);
  }

  const authUsers = authData?.users || [];
  
  // Create a map of auth users by id
  const authUserMap = new Map();
  authUsers.forEach(u => authUserMap.set(u.id, u));

  if (!appUsers || appUsers.length === 0) {
    console.log('📭 No app_users found in the database.');
    return;
  }

  console.log(`📋 Found ${appUsers.length} app_user(s) and ${authUsers.length} auth user(s):\n`);
  console.log('═'.repeat(120));
  
  appUsers.forEach((user, index) => {
    const authUser = authUserMap.get(user.id);
    
    console.log(`\n👤 User ${index + 1}:`);
    console.log(`   ID:              ${user.id}`);
    console.log(`   Email:           ${user.email}`);
    console.log(`   Full Name:       ${user.full_name || '(not set)'}`);
    console.log(`   Role:            ${user.role}`);
    console.log(`   Client ID:       ${user.client_id || '(none)'}`);
    console.log(`   Active:          ${user.is_active ? '✅ Yes' : '❌ No'}`);
    console.log(`   Created:         ${user.created_at}`);
    console.log(`   Updated:         ${user.updated_at}`);
    
    if (authUser) {
      console.log(`   ─── Auth Info ───`);
      console.log(`   Auth Email:      ${authUser.email}`);
      console.log(`   Email Confirmed: ${authUser.email_confirmed_at ? '✅ Yes' : '❌ No'}`);
      console.log(`   Last Sign In:    ${authUser.last_sign_in_at || '(never)'}`);
      console.log(`   Provider:        ${authUser.app_metadata?.provider || 'email'}`);
      console.log(`   Auth Created:    ${authUser.created_at}`);
      
      // Show user metadata if exists
      if (authUser.user_metadata && Object.keys(authUser.user_metadata).length > 0) {
        console.log(`   User Metadata:   ${JSON.stringify(authUser.user_metadata)}`);
      }
    } else {
      console.log(`   ⚠️  No matching auth.users record found!`);
    }
    
    console.log('─'.repeat(120));
  });

  // Check for auth users without app_users record
  const appUserIds = new Set(appUsers.map(u => u.id));
  const orphanAuthUsers = authUsers.filter(u => !appUserIds.has(u.id));
  
  if (orphanAuthUsers.length > 0) {
    console.log(`\n⚠️  Auth users WITHOUT app_users record (${orphanAuthUsers.length}):`);
    console.log('═'.repeat(120));
    orphanAuthUsers.forEach((authUser, index) => {
      console.log(`\n🔐 Orphan Auth User ${index + 1}:`);
      console.log(`   ID:              ${authUser.id}`);
      console.log(`   Email:           ${authUser.email}`);
      console.log(`   Email Confirmed: ${authUser.email_confirmed_at ? '✅ Yes' : '❌ No'}`);
      console.log(`   Last Sign In:    ${authUser.last_sign_in_at || '(never)'}`);
      console.log(`   Created:         ${authUser.created_at}`);
    });
  }

  console.log('\n' + '═'.repeat(120));
  console.log(`\n✅ Summary:`);
  console.log(`   • app_users: ${appUsers.length}`);
  console.log(`   • auth.users: ${authUsers.length}`);
  console.log(`   • Matched: ${appUsers.length - orphanAuthUsers.length}`);
  if (orphanAuthUsers.length > 0) {
    console.log(`   • Orphan auth users: ${orphanAuthUsers.length}`);
  }
}

listAppUsers();

