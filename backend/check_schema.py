import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
frontend_env = Path(__file__).resolve().parent.parent / 'frontend' / '.env.local'
if frontend_env.exists():
    load_dotenv(dotenv_path=str(frontend_env), override=True)

url = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
key = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY') or os.getenv('SUPABASE_ANON_KEY') or os.getenv('SUPABASE_KEY')
print('URL', url)
print('KEY loaded', bool(key))

client = create_client(url, key)
for name, table, column in [
    ('clusters', 'clusters', 'id'),
    ('grievances', 'grievances', 'cluster_id'),
]:
    try:
        res = client.table(table).select(column).limit(5).execute()
        print(f'{name} ->', res)
    except Exception as e:
        print(f'{name} ERROR ->', e)
