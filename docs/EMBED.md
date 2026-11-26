# Embed the visualization

The `?embed=1` view skips the title landing page and opens on the payment overview. Readers can scroll inside the frame to reach the recipient network and use the same search, recipient details and evidence links as on the full site.

```html
<iframe
  src="https://alibukhariii.github.io/ontario-health-dollar-flow/?embed=1"
  title="Where Ontario’s Health Dollars Went: published health-ministry payments"
  loading="lazy"
  style="display:block;width:100%;height:85vh;min-height:700px;border:0"
></iframe>
<p><a href="https://alibukhariii.github.io/ontario-health-dollar-flow/">
  Open the full project
</a></p>
```

Keep the iframe at full container width and give it enough height for comfortable scrolling. The embedded view keeps the payment source, project notes and attribution. External evidence links open in a new tab, and the **Open the full project** link exits the frame.

The website is static and uses no login or private API. The iframe contains a keyboard-accessible list alternative and links to the public data files. Test the embed within the host portfolio at desktop and phone widths before publication; the parent page controls the iframe’s height.
