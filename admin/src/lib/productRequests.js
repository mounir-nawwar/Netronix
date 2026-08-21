// Building the two product-write requests, in one place.
//
// `Add` and `Edit` send the same fields to different endpoints with different
// semantics — a POST that creates everything, a PATCH that changes only what it
// names — and the difference is exactly the kind of thing that drifts when two
// pages each assemble their own `FormData`.

import axios from 'axios'

import { backendUrl } from '../config'

/** The text fields both requests carry, as multipart form data. */
function appendCommonFields(formData, payload) {
    formData.append('name', payload.name)
    formData.append('description', payload.description)
    formData.append('price', payload.price)
    formData.append('brand', payload.brand)
    formData.append('bestSeller', String(payload.bestSeller))
    if (payload.variants !== undefined) formData.append('variants', JSON.stringify(payload.variants))
    // DB-003 — both representations are sent during the rollout. `inventory` is
    // the legacy bag: option values joined with "-", which cannot be split back
    // apart once a value contains one. `inventoryV2` states the option pairs
    // themselves, so `16-inch` and `RTX-4090` survive the round trip. The server
    // prefers V2 and derives the bag from it, so the two cannot disagree.
    if (payload.inventory !== undefined) formData.append('inventory', JSON.stringify(payload.inventory))
    if (payload.inventoryV2 !== undefined) formData.append('inventoryV2', JSON.stringify(payload.inventoryV2))
    if (payload.inventoryResolution !== undefined) formData.append('inventoryResolution', payload.inventoryResolution)
    formData.append('tags', JSON.stringify(payload.tags))
    formData.append('showcase', JSON.stringify(payload.showcase))

    for (const [index, file] of Object.entries(payload.imageFiles ?? {})) {
        formData.append(`image${Number(index) + 1}`, file)
    }
}

export async function createProduct(payload, token) {
    const formData = new FormData()
    appendCommonFields(formData, payload)
    const { data } = await axios.post(`${backendUrl}/api/product/add`, formData, { headers: { token } })
    return data
}

/**
 * ADM-002 — a partial update.
 *
 * Only slots the administrator actually touched carry a file, and
 * `clearImages` names the ones they explicitly removed. An untouched slot
 * appears in neither, which is how the server knows to keep the URL it has:
 * editing a name must not mean re-uploading four photographs, and it must not
 * mean losing them either.
 */
export async function updateProduct(id, payload, token) {
    const formData = new FormData()
    appendCommonFields(formData, payload)
    formData.append('clearImages', JSON.stringify(payload.clearImages ?? []))
    const { data } = await axios.patch(`${backendUrl}/api/product/${id}`, formData, { headers: { token } })
    return data
}

export async function fetchProduct(id) {
    const { data } = await axios.post(`${backendUrl}/api/product/single`, { productId: id })
    return data?.product ?? null
}

/**
 * ADM-004 — the whole inventory matrix in one atomic request.
 *
 * The console issued one request per combination, sequentially, aborting on the
 * first failure with every earlier one already committed: a 3x3 product was nine
 * requests and nine chances to leave the matrix half-saved, in a state neither
 * the administrator nor the customer could see.
 */
export async function saveInventory(id, entries, token) {
    const { data } = await axios.post(
        `${backendUrl}/api/product/${id}/inventory`,
        { entries },
        { headers: { token } },
    )
    return data
}

export async function archiveProduct(id, token) {
    const { data } = await axios.post(`${backendUrl}/api/product/archive`, { id }, { headers: { token } })
    return data
}

export async function restoreProduct(id, token) {
    const { data } = await axios.post(`${backendUrl}/api/product/restore`, { id }, { headers: { token } })
    return data
}

/**
 * Walk a bounded listing to the end (BE-009).
 *
 * Phase 2 capped every list endpoint at 100 records and put `total`, `page` and
 * `pages` in the envelope so a client could tell there was more. The console
 * read `items` from one request and rendered it as the whole list, so a catalog
 * of 150 products showed 100 and an order list of 150 showed 100 — with no
 * error and nothing on screen to suggest anything was missing. An administrator
 * cannot edit a product they cannot see.
 *
 * The walk is bounded: "keep asking until the server stops" turns one client
 * mistake into a thousand requests.
 */
export async function collectPages(fetchPage, { limit = 100, maxPages = 20 } = {}) {
    const items = []
    let page = 1
    let advertisedPages = 1
    let total = 0
    let malformedMetadata = false

    do {
        const data = await fetchPage({ page, limit })
        const batch = Array.isArray(data?.items) ? data.items : (data?.products ?? data?.orders ?? [])
        items.push(...batch)

        if (data?.pages !== undefined) {
            if (Number.isFinite(data.pages) && data.pages >= 1) {
                advertisedPages = Math.max(advertisedPages, data.pages)
            } else {
                malformedMetadata = true
            }
        }
        if (data?.total !== undefined) {
            if (Number.isFinite(data.total) && data.total >= 0) {
                total = Math.max(total, data.total)
            } else {
                malformedMetadata = true
            }
        } else {
            total = Math.max(total, items.length)
        }
        page += 1
    } while (page <= advertisedPages && page <= maxPages)

    return {
        items,
        total,
        truncated: malformedMetadata || page <= advertisedPages || items.length < total,
    }
}

/** Refuse to let a bounded walk masquerade as a complete data set. */
export function completeItems(collected, label) {
    if (collected.truncated) {
        throw new Error(`${label} is incomplete: received ${collected.items.length} of ${collected.total}`)
    }
    return collected.items
}

export async function listProducts({ includeArchived = false } = {}) {
    const collected = await collectPages(async (paging) => {
        const { data } = await axios.get(`${backendUrl}/api/product/list`, {
            params: { ...paging, ...(includeArchived ? { includeArchived: 'true' } : {}) },
        })
        return data
    })
    return completeItems(collected, 'Product list')
}
