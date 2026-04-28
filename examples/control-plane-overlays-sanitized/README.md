# Control-Plane Overlays Sanitized Example

This example shows how a portfolio or company control plane can own private overlays without putting that topology into a product repository.

The public cards are safe placeholders. The `private` overlay represents a portfolio-owned private view. The `company` overlay represents company-owned internal context. Ownership is recorded in metadata rather than in the overlay directory name so the example follows the implemented overlay profile rules. All names and URIs are fictional.

Run:

```sh
node ../../packages/cli/dist/index.js validate . --profile public
node ../../packages/cli/dist/index.js validate . --profile private
node ../../packages/cli/dist/index.js validate . --profile company
```
