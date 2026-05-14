#!/usr/bin/env python3
"""
Simple HTTP server for Social Media Image Generator
Just run: python3 server.py
Then open: http://localhost:8000
"""

import http.server
import socketserver
import os
import sys

PORT = 8000
DIRECTORY = "dist"

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Add headers to prevent caching and enable proper module loading
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # Custom log format
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    handler = MyHTTPRequestHandler

    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"""
╔════════════════════════════════════════════════════════╗
║   HHC Social Media Image Generator                    ║
║   Server running on http://localhost:{PORT}            ║
║                                                        ║
║   Press Ctrl+C to stop                                 ║
╚════════════════════════════════════════════════════════╝
""")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n✓ Server stopped")
            sys.exit(0)
