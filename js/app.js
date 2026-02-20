// CRM App - Main JS

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test connection
async function testConnection() {
  const { data, error } = await supabase.from('contacts').select('count').limit(1);
  if (error) {
    console.error('Supabase connection error:', error.message);
  } else {
    console.log('Supabase connected successfully.');
  }
}

testConnection();
