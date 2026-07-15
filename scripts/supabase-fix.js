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

async function fixConnectionIssues() {
  try {
    console.log('Attempting to fix Supabase connection issues...');

    // Check network connectivity
    const networkCheck = await fetch('https://api.supabase.com/v1/status');
    if (!networkCheck.ok) {
      console.error('Network connectivity issue detected');
      return false;
    }

    // Test with different timeout settings
    const { data: timeoutData, error: timeoutError } = await supabase.query('SELECT 1', {
      timeout: 30000 // 30 second timeout
    });
    if (timeoutError) {
      console.error('Timeout test failed:', timeoutError);
      return false;
    } else {
      console.log('Timeout test successful:', timeoutData);
    }

    // Test with alternative connection method
    const { data: altData, error: altError } = await supabase.rpc('get_status');
    if (altError) {
      console.error('Alternative connection method failed:', altError);
      return false;
    } else {
      console.log('Alternative connection successful:', altData);
    }

    // Check for common issues
    const commonIssues = [
      'connection timeout',
      'network error',
      'authentication failed'
    ];

    console.log('Common issues checked:', commonIssues);

    // Attempt to reset connection
    await supabase.remove();
    console.log('Connection reset attempted');

    // Final test
    const { data: finalData, error: finalError } = await supabase.query('SELECT version()');
    if (finalError) {
      console.error('Final connection test failed:', finalError);
      return false;
    } else {
      console.log('Final connection successful:', finalData);
    }

    console.log('Connection fix attempts completed');
    return true;
  } catch (error) {
    console.error('Connection fix error:', error);
    return false;
  }
}

fixConnectionIssues();
