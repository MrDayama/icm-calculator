import http.server
import socketserver
import socket
import os

PORT = 8080
DIRECTORY = "web"

def get_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def start_server():
    ip = get_ip()
    print("\n" + "="*50)
    print("📱 スマホから実行する方法:")
    print("="*50)
    print(f"1. PCとスマホを同じWi-Fiに接続してください。")
    print(f"2. スマホのブラウザで以下のURLを開いてください:")
    print(f"   http://{ip}:{PORT}/")
    print("="*50)
    print(f"\nServing at: http://localhost:{PORT}/")
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping server...")
            httpd.server_close()

if __name__ == "__main__":
    if not os.path.exists(DIRECTORY):
        print(f"Error: Directory '{DIRECTORY}' not found.")
    else:
        start_server()
