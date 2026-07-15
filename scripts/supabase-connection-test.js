import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  }
});

async function testConnection() {
  try {
    console.log('Testing Supabase connection...');

    // Test basic connection
    const { data: basicData, error: basicError } = await supabase.rpc('test_connection');
    if (basicError) {
      console.error('Basic connection test failed:', basicError);
    } else {
      console.log('Basic connection successful:', basicData);
    }

    // Test version query
    const { data: versionData, error: versionError } = await supabase.query('SELECT version()');
    if (versionError) {
      console.error('Version query failed:', versionError);
    } else {
      console.log('Database version:', versionData);
    }

    // Test table existence
    const { data: tablesData, error: tablesError } = await supabase.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    if (tablesError) {
      console.error('Table check failed:', tablesError);
    } else {
      console.log('Available tables:', tablesData);
    }

    // Test authentication
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error('Authentication check failed:', authError);
    } else {
      console.log('Authentication status:', authData);
    }

    console.log('Connection tests completed');
  } catch (error) {
    console.error('Connection test error:', error);
  }
}

testConnection();
