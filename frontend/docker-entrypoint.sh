#!/bin/sh
# Substitute ONLY $BACKEND_URL in the nginx template.
# All other nginx variables ($host, $remote_addr, etc.) are left untouched.
envsubst '$BACKEND_URL' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
