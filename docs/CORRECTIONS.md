# Correction policy

## Report an issue

Use the repository’s [data-error form](https://github.com/alibukhariii/ontario-health-dollar-flow/issues/new?template=data-error.yml). Include the organization or program, the displayed amount, the page URL and the source that supports the correction. Do not include personal health information.

## Review process

1. Reproduce the displayed value from the frozen release inputs.
2. Compare it with the cited public source and check the fiscal period, published label and organization identity.
3. Classify the issue as source revision, extraction error, identity error, taxonomy error, interface error or documentation clarification.
4. Correct the pipeline or source record rather than editing generated output by hand.
5. Rebuild the complete release and run reconciliation, privacy, link, accessibility and browser tests.
6. Record material corrections in the changelog and release-difference report. Preserve superseded source values when a publisher restates them.

Confirmed errors that materially change a headline, organization total or route receive priority. Questions that cannot be resolved from public evidence remain visible limitations rather than inferred corrections.
