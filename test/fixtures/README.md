Fixtures contain only the DOM structure used by the selectors and public product
data. Files ending in `-real.html` are reduced, sanitized examples derived from
the site markup, not full page captures.

Never replace them with authenticated page dumps. Raw captures and screenshots
belong in `spike/captures/`, which is excluded from Git. Do not commit account
identifiers, addresses, phone numbers, email addresses, payment methods, card
suffixes, session tokens, inline scripts, or hidden form fields.
