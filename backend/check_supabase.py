import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
frontend_env = Path(__file__).resolve().parent.parent / 'frontend' / '.env.local'
load_dotenv(dotenv_path=str(frontend_env), override=True)
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY') or os.getenv('SUPABASE_ANON_KEY') or os.getenv('SUPABASE_KEY')
print('SUPABASE_URL=', SUPABASE_URL)
print('SUPABASE_KEY loaded=', bool(SUPABASE_KEY))
client = create_client(SUPABASE_URL, SUPABASE_KEY)
for table in ['clusters', 'grievances']:
    try:
        res = client.table(table).select('*').limit(1).execute()
        print(table, res)
    except Exception as e:
        print(table, 'ERROR', e)
