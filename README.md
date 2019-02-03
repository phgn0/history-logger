# history logger

## Overview

This experiment is part of a general idea of mine to use browser history data to discover website relationships.

The browser extension here gathers site relationships beyond whats accessible with the [webextension history api](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/history):

- when did the user leave a website
- get the parent site from which another site was opened (clicked link)
- which sites were opened in a new tab vs in the same
- which tabs were open at the same time and in what order

This allows us to build a rich navigation graph, not just one based on time correlation alone.

## Technical overview

It's a basic webextension written in typescript.

For data access it uses the [webextension tab api](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs).

The captured user actions are saved to an indexedDB database via the background script.

To use it, install the manifest.json as a temporary extension in your browser. Open the devtools for the extension (via "debug"), and you can see the saved data in the storage inspector.

## Current status

It does save navigation data reliably, though:

- the code could use a cleanup
- there seems to be a small browser performance impact due to many indexedDB transactions
- it lacks a basic data visualization & export functionality

So this isn't really a finished thing, and I do plan to expand it in the future.

But use it for your own experiments if you like :)
