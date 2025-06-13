console.log('Script loaded, Supabase available:', typeof Supabase !== 'undefined');
if (typeof Supabase === 'undefined') {
  console.error('Supabase client failed to load');
  document.getElementById('message').textContent = '❌ Failed to load Supabase client.';
  return;
}
const supabaseUrl = 'https://bqpjljsjsssvjuztaupz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcGpsanNqc3Nzdmp1enRhdXB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1MDgzOTcsImV4cCI6MjA2NTA4NDM5N30.JSoiFcpKiYj_b5rapTl8jFIEDlTkSQGa85rpegivxKI';
const supabase = Supabase.createClient(supabaseUrl, supabaseKey);

document.getElementById('channel-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const channel = {
    friend_name: formData.get('friend_name'),
    channel_handle: formData.get('channel_handle')
  };
  console.log('Submitting channel:', channel);
  const message = document.getElementById('message');
  if (!channel.friend_name || !channel.channel_handle) {
    message.textContent = '❌ Enter a name and a valid channel handle.';
    return;
  }
  try {
    const { data, error } = await supabase.from('channels').insert([channel]);
    if (error) throw new Error(`Supabase error: ${JSON.stringify(error, null, 2)}`);
    message.textContent = 'Channel submitted successfully!';
  } catch (error) {
    console.error('Error details:', error);
    message.textContent = `Error: ${error.message}`;
  }
});
