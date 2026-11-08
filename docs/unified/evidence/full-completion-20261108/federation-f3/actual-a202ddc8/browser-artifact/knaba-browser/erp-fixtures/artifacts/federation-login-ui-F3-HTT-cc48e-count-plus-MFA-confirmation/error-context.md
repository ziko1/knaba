# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#account-main"
  - generic [ref=e3]:
    - generic [ref=e4]:
      - link "KNABA" [ref=e5] [cursor=pointer]:
        - /url: /konto/?lang=en
      - link "← Back to account settings" [ref=e6] [cursor=pointer]:
        - /url: /account/settings/?lang=en
    - banner [ref=e7]:
      - paragraph [ref=e8]: My KNABA account
      - heading "Sign in to ERP with your website account" [level=1] [ref=e9]
      - paragraph [ref=e10]: Check your account, company and application. Your existing ERP permissions continue to apply.
    - main [ref=e11]:
      - generic [ref=e12]:
        - generic [ref=e13]:
          - term [ref=e14]: Website account
          - definition [ref=e15]: Synthetic website account
          - term [ref=e16]: ERP company
          - definition [ref=e17]: Synthetic Company
          - term [ref=e18]: Application
          - definition [ref=e19]: KNABA Web
        - generic [ref=e20]:
          - generic [ref=e21]:
            - generic [ref=e22]:
              - text: Current password
              - generic [ref=e23]: "*"
            - textbox "Current password" [ref=e24]
          - generic [ref=e25]:
            - checkbox "I have checked the account, company and application and want to use this account to sign in to ERP." [ref=e26]
            - text: I have checked the account, company and application and want to use this account to sign in to ERP.
          - button "Confirm sign-in" [ref=e28] [cursor=pointer]
```