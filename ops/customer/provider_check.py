#!/usr/bin/env python3
"""Verify KNABA provider accounts. No message is sent and no paid channel is enabled."""
import argparse
import json
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

class ProviderError(Exception):
    pass

def require(condition, code):
    if not condition:
        raise ProviderError(code)

def read_environment(path):
    path = Path(path)
    require(path.is_file() and not path.is_symlink() and path.stat().st_mode & 0o077 == 0, 'PRIVATE_ENV_FILE_REQUIRED')
    values = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        found = re.fullmatch(r"([A-Z][A-Z0-9_]*)=(?:'([^']*)'|([^\r\n]*))", line)
        require(found is not None, 'INVALID_ENV_FILE')
        values[found[1]] = found[2] if found[2] is not None else found[3]
    return values

def public_origin(value):
    try:
        u = urllib.parse.urlsplit(value)
        require(u.scheme == 'https' and u.hostname and u.path in ['', '/'] and not u.query and not u.fragment and not u.username and not u.password and not u.port, 'HTTPS_PUBLIC_ORIGIN_REQUIRED')
        require(not u.hostname.endswith(('.invalid', '.test', '.localhost')) and u.hostname != 'localhost', 'REAL_PUBLIC_ORIGIN_REQUIRED')
        return 'https://' + u.netloc
    except (ValueError, TypeError):
        raise ProviderError('HTTPS_PUBLIC_ORIGIN_REQUIRED') from None

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ProviderError('PROVIDER_REDIRECT_REFUSED')

def request_json(url, payload=None, headers=None):
    """Fixed provider URLs, TLS verified, no redirects, bounded response and no URL logging."""
    req = urllib.request.Request(url, data=None if payload is None else json.dumps(payload).encode(), headers=headers or {})
    if payload is not None:
        req.add_header('Content-Type', 'application/json')
    try:
        opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context()))
        with opener.open(req, timeout=15) as response:
            data = response.read(65537)
            require(len(data) <= 65536, 'PROVIDER_RESPONSE_TOO_LARGE')
            value = json.loads(data)
            require(isinstance(value, dict), 'PROVIDER_RESPONSE_INVALID')
            return value
    except ProviderError:
        raise
    except (urllib.error.URLError, OSError, ValueError):
        # Exception messages can contain the Telegram token in the request URL.
        raise ProviderError('PROVIDER_CHECK_FAILED') from None

def verify_telegram(env, request=request_json, apply=False, expected_previous=None):
    token = env.get('TELEGRAM_BOT_TOKEN', '')
    require(re.fullmatch(r'[0-9]+:[A-Za-z0-9_-]{20,}', token), 'TELEGRAM_TOKEN_REQUIRED')
    base = 'https://api.telegram.org/bot' + token + '/'
    def api(method, payload=None):
        value = request(base + method, payload)
        require(value.get('ok') is True and 'result' in value, 'TELEGRAM_API_REJECTED')
        return value['result']
    identity = api('getMe')
    require(isinstance(identity, dict) and identity.get('is_bot') is True and isinstance(identity.get('id'), int), 'TELEGRAM_BOT_IDENTITY_INVALID')
    username = identity.get('username', '')
    require(re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{1,28}bot', username, re.I), 'TELEGRAM_USERNAME_INVALID')
    configured = env.get('KNABA_VERIFIED_TELEGRAM_BOT')
    require(not configured or configured.lower() == username.lower(), 'TELEGRAM_ACCOUNT_MISMATCH')
    state = api('getWebhookInfo')
    require(isinstance(state, dict) and isinstance(state.get('url'), str), 'TELEGRAM_WEBHOOK_STATE_INVALID')
    desired = public_origin(env.get('PUBLIC_ORIGIN', '')) + '/webhooks/telegram'
    current = state['url']
    if apply:
        require(not current or current == desired or expected_previous == current, 'EXISTING_WEBHOOK_REPLACEMENT_REQUIRES_EXACT_PREVIOUS_URL')
        secret = env.get('TELEGRAM_WEBHOOK_SECRET', '')
        require(re.fullmatch(r'[A-Za-z0-9_-]{16,256}', secret), 'TELEGRAM_WEBHOOK_SECRET_REQUIRED')
        # Applying even an unchanged URL refreshes the secret deliberately. Never discard queued updates.
        result = api('setWebhook', {'url': desired, 'secret_token': secret, 'allowed_updates': ['message', 'callback_query'], 'drop_pending_updates': False})
        require(result is True, 'TELEGRAM_WEBHOOK_NOT_CONFIRMED')
        state = api('getWebhookInfo')
        require(state.get('url') == desired, 'TELEGRAM_WEBHOOK_READBACK_MISMATCH')
    return {'provider': 'TELEGRAM', 'account': username, 'publicUrl': 'https://t.me/' + username,
            'accountVerified': True, 'webhookMatches': state['url'] == desired,
            'webhookApplied': apply, 'pendingUpdates': state.get('pending_update_count'),
            'hasWebhookError': bool(state.get('last_error_date')), 'realMessageDelivery': 'NOT_RUN',
            'sendingEnabledByThisCommand': False}

def verify_whatsapp(env, request=request_json):
    token, phone, version = (env.get(k, '') for k in ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_API_VERSION'])
    require(token and re.fullmatch(r'[0-9]{4,30}', phone) and re.fullmatch(r'v[0-9]{1,3}\.[0-9]{1,2}', version), 'WHATSAPP_CONFIGURATION_REQUIRED')
    value = request('https://graph.facebook.com/' + version + '/' + phone + '?fields=id,display_phone_number,verified_name', None, {'Authorization': 'Bearer ' + token})
    require(str(value.get('id', '')) == phone and isinstance(value.get('display_phone_number'), str), 'WHATSAPP_ACCOUNT_MISMATCH')
    number = re.sub(r'[^0-9]', '', value['display_phone_number'])
    require(re.fullmatch(r'[1-9][0-9]{7,14}', number), 'WHATSAPP_PUBLIC_NUMBER_INVALID')
    expected = env.get('KNABA_VERIFIED_WHATSAPP_NUMBER', '')
    require(not expected or expected == number, 'WHATSAPP_PUBLIC_NUMBER_MISMATCH')
    return {'provider': 'WHATSAPP', 'publicUrl': 'https://wa.me/' + number, 'publicNumber': number,
            'accountVerified': True, 'webhookAndDelivery': 'NOT_RUN', 'calling': 'NOT_RUN',
            'sendingEnabledByThisCommand': False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', required=True, help='Protected erp.env; never pass credentials on command line.')
    parser.add_argument('--site-env-file', help='Optional protected site.env; reads only expected public bot identities for account matching.')
    parser.add_argument('--channel', required=True, choices=['telegram', 'whatsapp'])
    parser.add_argument('--apply-telegram-webhook', action='store_true', help='Explicitly configure the verified Telegram bot webhook; never sends messages.')
    parser.add_argument('--replace-webhook-from', help='Exact existing URL when deliberately moving the same bot to another server.')
    args = parser.parse_args()
    try:
        require(args.channel == 'telegram' or not args.apply_telegram_webhook, 'TELEGRAM_CHANNEL_REQUIRED')
        env = read_environment(args.env_file)
        if args.site_env_file:
            public = read_environment(args.site_env_file)
            for key in ['KNABA_VERIFIED_TELEGRAM_BOT', 'KNABA_VERIFIED_WHATSAPP_NUMBER']:
                if key in public:
                    env[key] = public[key]
        result = verify_telegram(env, apply=args.apply_telegram_webhook, expected_previous=args.replace_webhook_from) if args.channel == 'telegram' else verify_whatsapp(env)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except ProviderError as error:
        print(json.dumps({'status': 'BLOCKED', 'reason': str(error), 'realMessageDelivery': 'NOT_RUN'}))
        return 2
    return 0

if __name__ == '__main__':
    sys.exit(main())
