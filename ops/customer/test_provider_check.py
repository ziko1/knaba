import importlib.util
import pathlib
import unittest

spec=importlib.util.spec_from_file_location('knaba_provider_check',pathlib.Path(__file__).with_name('provider_check.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ProviderChecks(unittest.TestCase):
    def fixture(self, previous=''):
        calls=[]
        state={'url':previous,'pending_update_count':2}
        def request(url,payload=None,headers=None):
            method=url.rsplit('/',1)[1];calls.append((method,payload))
            if method=='getMe':return {'ok':True,'result':{'id':12345,'is_bot':True,'username':'SyntheticKnabaBot'}}
            if method=='getWebhookInfo':return {'ok':True,'result':dict(state)}
            if method=='setWebhook':state['url']=payload['url'];return {'ok':True,'result':True}
            self.fail('Unexpected provider method')
        env={'TELEGRAM_BOT_TOKEN':'12345:'+'a'*30,'TELEGRAM_WEBHOOK_SECRET':'s'*32,'PUBLIC_ORIGIN':'https://customer.example.com'}
        return env,request,calls
    def test_read_only_check_never_sends_or_sets_webhook(self):
        env,request,calls=self.fixture()
        result=module.verify_telegram(env,request)
        self.assertEqual([x[0] for x in calls],['getMe','getWebhookInfo'])
        self.assertFalse(result['sendingEnabledByThisCommand']);self.assertEqual(result['realMessageDelivery'],'NOT_RUN')
        self.assertNotIn(env['TELEGRAM_BOT_TOKEN'],str(result))
    def test_migration_requires_exact_old_webhook_and_never_discards_updates(self):
        env,request,calls=self.fixture('https://previous.example.com/webhooks/telegram')
        with self.assertRaisesRegex(module.ProviderError,'EXISTING_WEBHOOK'):module.verify_telegram(env,request,apply=True)
        self.assertFalse(any(x[0]=='setWebhook' for x in calls))
        result=module.verify_telegram(env,request,apply=True,expected_previous='https://previous.example.com/webhooks/telegram')
        self.assertTrue(result['webhookMatches'])
        self.assertFalse(next(x[1] for x in calls if x[0]=='setWebhook')['drop_pending_updates'])
    def test_mismatched_account_is_refused_before_configuration(self):
        env,request,calls=self.fixture();env['KNABA_VERIFIED_TELEGRAM_BOT']='DifferentBot'
        with self.assertRaisesRegex(module.ProviderError,'ACCOUNT_MISMATCH'):module.verify_telegram(env,request,apply=True)
        self.assertEqual(len(calls),1)
    def test_whatsapp_account_verification_is_read_only_and_not_delivery_proof(self):
        calls=[]
        def request(url,payload,headers):
            calls.append((url,payload));self.assertEqual(headers['Authorization'],'Bearer synthetic-only')
            return {'id':'123456789','display_phone_number':'+49 170 1111111'}
        result=module.verify_whatsapp({'WHATSAPP_ACCESS_TOKEN':'synthetic-only','WHATSAPP_PHONE_NUMBER_ID':'123456789','WHATSAPP_API_VERSION':'v99.0'},request)
        self.assertEqual(result['publicUrl'],'https://wa.me/491701111111');self.assertIsNone(calls[0][1]);self.assertEqual(result['calling'],'NOT_RUN')

if __name__=='__main__':unittest.main()
