IndexNow uses the verification file `6dd7918bd5d24d8588b131871a065a11.txt` at the website root. The website builder preserves it.

The GitHub workflow submits public HTML pages changed on `main`, including deleted pages. It waits for the key and changed content to be live before notifying IndexNow. A failed deployment leaves the workflow failed instead of reporting a successful submission. Rerun it after fixing deployment.

For an initial submission or a manual retry of all current pages, run the **Notify IndexNow** workflow manually, or run `node .website/indexnow.mjs` from the repository root. Test URL selection with `node .website/indexnow.mjs --test`.

HTTP 200 means received; HTTP 202 means received with key validation pending. Neither guarantees indexing. Check receipt and indexing in Bing Webmaster Tools.
