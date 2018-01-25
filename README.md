# prebid-js-external-js-template

This repo is a template for prebid.js adapters that would like to use external JavaScript in their Prebid.js Adapters. See Policy below for details. 

## Repo structure:

```
├── README.md
├── build                  - build related artifacts
├── dist                   - checked in build files
│   ├── 0.0.1              - semantic versioned folder
│   │   ├── code.js        - unminified build file
│   │   └── code.min.js    - minified build file
│   └── code.min.js        - minified current prod code
│   ├── code.js            - unminified current prod code
└── src
    └── code.js
```

## Instructions

 1. Request that a prebid.org core team member clone this repo into a separate company specific repo such as `prebid-js-external-js-company_name`.
 1. Once granted access to the new repo, upload your external JS source code into the `/src`.
 1. Add your build related items into the `/build` folder so that your source files can be built unto minified and unminified prod files.
 1. Check in your built files under `/dist/[version]/prod.js` and `/dist/[version]/prod.min.js` and also at `/dist/prod.min.js` to indicate which file is currently prod.
 1. Use a git tag matching your semvar version @ `/dist/prod.min.js` so that jsdelivr can point to a specific version. 
 1. Update your `LICENSE` file as necessary.
 1. Publish your CDN file using https://www.jsdelivr.com or alternatively a Prebid.org approved vendor. If using jsdelivr (preferred), files are automatically published via convention at `https://cdn.jsdelivr.net/gh/<org>/<project>@<semvar>/<file_path>`. 
 1. Use the published URL in step 7 in your Prebid.js adapter submission. 

## Policy

Prebid.js adapter policy states no external javascript is allowed (see [this link](http://prebid.org/dev-docs/bidder-adaptor.html#bidder-adaptor-Required-Adapter-Conventions) ). The following policy provides an exception to this rule if the conventions below are followed:

1. Prebid.org creates a public Github repository with no license distribution constraints for external libraries. All code there is proprietary, with the committer being the IP owner.
1. This repo, while owned by the Prebid.org, will provide full admin access to the commiters.
1. The production URL that is commited inside the Prebid.js adapter needs to be hosted by https://www.jsdelivr.com or by a Prebid.org approved vendor.
    1. Prebid.org approved vendors must support the following:
        1. Local presence in major regions including: North and South America, EU, APAC.
        1. Must have local response time < 100ms for 90th percentile. 
        1. Must include proper caching directive header such as: cache-control: max-age; etag; expires etc.
1. The build process must be transparent and Prebid.org reserves the right to spot check and/or run a script to check published CDN checkusms match the checked in dist files.
1. Prebid.org will indicate on the [download page](http://prebid.org/download.html) that a particular vendor downloads additional external JavaScript. 
