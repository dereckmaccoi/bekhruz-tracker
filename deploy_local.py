"""
Deploy tracker to VPS: pack client/dist + server → upload → extract → restart.
Run from the tracker/ root directory.
"""
import io, os, sys, tarfile, paramiko

HOST  = '46.62.147.30'
PORT  = 22
USER  = 'root'
KEY   = os.path.expanduser('~/.ssh/id_ed25519')
REMOTE_DIR = '/home/bekhruz/tracker'

def make_tarball():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        for folder in ['client/dist', 'server']:
            local = os.path.join(os.path.dirname(__file__), folder)
            if not os.path.exists(local):
                print(f'  WARNING: {local} not found, skipping')
                continue
            tar.add(local, arcname=folder)
            print(f'  packed {folder}')
    return buf.getvalue()

def run(client, cmd, check=True):
    print(f'  $ {cmd}')
    _, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    rc  = stdout.channel.recv_exit_status()
    if out: print(out.rstrip())
    if err: print(err.rstrip(), file=sys.stderr)
    if check and rc != 0:
        raise RuntimeError(f'Command failed (rc={rc}): {cmd}')
    return rc

def main():
    print('=== Bekhruz Tracker Deploy ===')

    print('\n[1/3] Packing files...')
    data = make_tarball()
    print(f'  tarball: {len(data):,} bytes')

    print('\n[2/3] Connecting to VPS...')
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, PORT, username=USER, key_filename=KEY)
    print('  connected')

    print('\n[3/3] Uploading via SFTP...')
    sftp = client.open_sftp()
    sftp.putfo(io.BytesIO(data), '/tmp/tracker_deploy.tar.gz')
    sftp.close()
    print('  uploaded')

    run(client, f'tar -xzf /tmp/tracker_deploy.tar.gz -C {REMOTE_DIR}')
    run(client, 'rm /tmp/tracker_deploy.tar.gz')

    print('\n[migrate] Running DB migrations...')
    migrations = [
        "ALTER TABLE metrics ADD COLUMN IF NOT EXISTS is_inverse BOOLEAN DEFAULT FALSE",
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='metrics_type_check') THEN ALTER TABLE metrics DROP CONSTRAINT metrics_type_check; END IF; END $$",
        "UPDATE metrics SET type = 'regular' WHERE type IN ('weekly', 'daily', 'inverse')",
        "UPDATE metrics SET is_inverse = TRUE WHERE type = 'inverse'",
        "ALTER TABLE metrics ADD CONSTRAINT metrics_type_check CHECK (type IN ('regular', 'campaign'))",
    ]
    for sql in migrations:
        run(client, f"sudo -u postgres psql -d tracker -c \"{sql}\"", check=False)

    print('\n[restart] Restarting service...')
    run(client, 'systemctl restart bekhruz-tracker')
    run(client, 'systemctl is-active bekhruz-tracker', check=False)

    client.close()
    print('\n=== Deploy complete ===')

if __name__ == '__main__':
    main()
