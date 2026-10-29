# Feedback

Footer modal that posts to the Netlify `feedback` form. Not a hash route.

## Sub-features

- Open from footer `#footerFeedback`, or from FAQ `.faq-feedback`
- Message `#feedbackMessage` / `.feedback-message` (required)
- Optional email `#feedbackEmail`
- Send `.feedback-send` → `.feedback-card.is-sent` and `.feedback-sent-copy` (“Sent.”)
- Static Netlify form in `index.html` (`form[name=feedback]`) so deploys register the fields

## How to get to it (user POV)

Scroll to the footer, click **feedback**. Or open **faq** and click **send feedback**.

## Driving it with verify

```bash
npm run verify -- check feedback
npm run verify -- shot feedback
```

Harness: click `#footerFeedback`, type into `.feedback-message`, click `.feedback-send`.

**Observable end state:** the cloned modal `.feedback-card` has class `is-sent` and `.feedback-sent-copy` contains `Sent`.

## Gotchas

- On localhost / any host that is not `skyler.tools` or `*.netlify.app`, send **short-circuits** and shows Sent without POSTing. That is app behavior (`app.js` `live` hostname check). The local proof is the Sent UI, not a Netlify inbox row.
- Do not submit junk to production. This skill’s check runs against the local server.
- Empty message shows `Write a note first.` in `.feedback-error` — use that if you are proving validation, not the happy path.
- Footer also has **about**, **backup**, **faq**. Those are separate modals (`#footerAbout`, `#footerBackup`, `#footerFaq`).
