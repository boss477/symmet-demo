# Design: Clickable home carousel + nav links for Shop/Checkout

Date: 2026-08-02
Project: symmet-demo (symmet.in)

## Goal

1. Make the 3 rotating product photos in the home-page "A small taste of the collection"
   carousel clickable. Clicking one should open its existing product page (image, price,
   description, dimensions, Add to Cart).
2. Make Shop and Checkout directly reachable from the main navigation.

## Current state

- The carousel items in `index.html` (`#shop-carousel`) are hardcoded with `data-index`
  only; they have no click handler.
- Product page (`#page-product`) exists and is opened via
  `navigate('product', { product })` in `app.js`; product cards use `findProductById(id)`.
- Nav (`index.html` nav-links) has Home / Shop / Studio / About / Contact. Shop already
  exists; Checkout is only reachable from the cart drawer.

## Changes

### index.html
- Add `data-product` with the product code to each `.shop-carousel-item`:
  - `SMKAP LS 005` (Lounge Seating No. 5)
  - `SMKAP LS 006` (Lounge Seating No. 6)
  - `SMKAP LS 037` (Lounge Seating No. 51)
- Add a "Checkout" nav link (`data-page="checkout"`) after the Shop link.

### app.js
- In `initShopCarousel()`, add a click handler on each `.shop-carousel-item` that reads
  `data-product`, resolves it with `findProductById()`, and calls
  `navigate('product', { product })`.

## Out of scope

- No new pages (Shop, Store, Product, Checkout all exist).
- No CSS/design changes.
- No routing changes (existing `navigate()` + `data-page` delegation handles it).
