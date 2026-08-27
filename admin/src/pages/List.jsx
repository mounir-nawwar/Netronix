import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

import { entriesOf, variantLabel } from '../lib/variant';
import { formatMoney, readMinor } from '../lib/money';
import {
  archiveProduct, listProducts, restoreProduct, saveInventory,
} from '../lib/productRequests';
import useDialog from '../lib/useDialog';

// PHASE 3 — ADM-003 (UI half) and ADM-004.
//
// **ADM-004 — one atomic save.** `updateInventory` looped over the matrix and
// issued **one HTTP request per combination**, sequentially, returning early on
// the first failure. A 3x3 product was nine requests; a failure on the sixth
// left five committed and four not, and nothing on screen said which. The whole
// matrix now goes in one request that either applies completely or changes
// nothing (`POST /api/product/:id/inventory`).
//
// **ADM-003 — no one-click destruction.** The row's only action was
// `<button onClick={() => removeProduct(item._id)}>Delete</button>`: one click,
// no dialog, an immediate hard delete. Phase 2 made the API refuse a delete
// while any order references the product, and added archive/restore. This is the
// half that was left: a confirmation that names the product, archive as the
// default action, an archived filter, and a restore.
//
// The hard delete is not offered here at all. It exists on the API for a
// genuinely unreferenced product, and reaching for it should be a deliberate act
// rather than the button nearest the mouse.

const List = ({ token }) => {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [inventoryEdit, setInventoryEdit] = useState({});
  const [isSavingInventory, setIsSavingInventory] = useState(false);

  /** The product awaiting a typed confirmation before it is archived. */
  const [pendingArchive, setPendingArchive] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);

  const fetchList = useCallback(async () => {
    setStatus('loading');
    setLoadError('');
    try {
      // The archived filter is a server-side one: `includeArchived` is what the
      // catalog endpoint already accepts, so the console is not filtering a page
      // of results it happened to receive.
      //
      // The token has to go with it. `/api/product/list` is public, but the
      // archived view behind `includeArchived` is admin-only
      // (`adminAuthForArchivedQuery`, DB-007) — so without it, ticking "Show
      // archived" asked for an admin view anonymously, took a 401, and rendered
      // "No archived products" over a product that had just been archived.
      setList(await listProducts({ includeArchived: showArchived, token }));
      setStatus('ready');
    } catch (error) {
      console.error('Fetch Error:', error);
      setStatus('error');
      setLoadError(error.message || 'Could not load the product list');
      toast.error(error.response?.data?.message ?? 'Could not load the product list');
    }
  }, [showArchived, token]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Filtered here as well as server-side. `includeArchived` is what the request
  // asks for, but the list must never *show* an archived product while the
  // archived view is off, whatever a future endpoint decides to return.
  const visible = list.filter((item) => Boolean(item.archived) === showArchived);

  /**
   * DB-003 — the matrix is keyed by the combination's canonical identity.
   *
   * It used to be keyed by the hyphen-joined string, which meant a product with
   * a `16-inch` or `RTX-4090` option had rows the console could not label and
   * whose updates the server could not resolve back to a real combination.
   */
  const openInventoryModal = (product) => {
    setSelectedProduct(product);
    setInventoryEdit(Object.fromEntries(
      entriesOf(product).map((entry) => [entry.variantId, entry.quantity]),
    ));
  };

  const closeInventoryModal = () => {
    setSelectedProduct(null);
    setInventoryEdit({});
  };

  // ADM-012 / A11Y-002 — Phase 3 gave both modals `role="dialog"`,
  // `aria-modal` and `aria-labelledby`. What was still missing is the part a
  // keyboard user actually needs: focus moving into the dialog, Tab staying
  // inside it, Escape closing it, and focus returning to the row button that
  // opened it. Before this, someone who opened the inventory modal with a
  // keyboard could not leave it — Tab walked out into the page behind and
  // there was no way back or out.
  //
  // Both use the same primitive as the storefront, so there is one focus trap
  // in the project rather than four.
  const archiveDialog = useDialog({
    open: Boolean(pendingArchive),
    onClose: () => setPendingArchive(null),
    lockScroll: true,
  });
  const inventoryDialog = useDialog({
    open: Boolean(selectedProduct),
    onClose: closeInventoryModal,
    lockScroll: true,
  });


  const handleInventoryChange = (variantId, value) => {
    setInventoryEdit((previous) => ({
      ...previous,
      [variantId]: Math.max(0, parseInt(value, 10) || 0),
    }));
  };

  const saveInventoryMatrix = async () => {
    if (!selectedProduct) return;
    setIsSavingInventory(true);

    try {
      const entries = entriesOf(selectedProduct)
        .filter((entry) => inventoryEdit[entry.variantId] !== undefined)
        .map((entry) => ({
          // The lossless form (DB-003): the server resolves the combination
          // without splitting anything, so `16-inch` addresses the row the
          // administrator actually edited.
          variantOptions: entry.options,
          quantity: Number(inventoryEdit[entry.variantId]) || 0,
        }));

      const data = await saveInventory(selectedProduct._id, entries, token);
      if (!data?.success) {
        toast.error(data?.message ?? 'Could not update the inventory');
        return;
      }

      toast.success('Inventory updated successfully');
      closeInventoryModal();
      await fetchList();
    } catch (error) {
      console.error('Update Inventory Error:', error);
      // Nothing was written: the request is validated in full before it applies.
      toast.error(error.response?.data?.message ?? 'Failed to update inventory. Nothing was changed.');
    } finally {
      setIsSavingInventory(false);
    }
  };

  const confirmArchive = async () => {
    if (!pendingArchive) return;
    setIsArchiving(true);
    try {
      const data = await archiveProduct(pendingArchive._id, token);
      if (!data?.success) {
        toast.error(data?.message ?? 'Could not archive the product');
        return;
      }
      toast.success(`${pendingArchive.name} archived`);
      setPendingArchive(null);
      await fetchList();
    } catch (error) {
      toast.error(error.response?.data?.message ?? 'Could not archive the product');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleRestore = async (product) => {
    try {
      const data = await restoreProduct(product._id, token);
      if (!data?.success) {
        toast.error(data?.message ?? 'Could not restore the product');
        return;
      }
      toast.success(`${product.name} restored`);
      await fetchList();
    } catch (error) {
      toast.error(error.response?.data?.message ?? 'Could not restore the product');
    }
  };

  /**
   * The human label for a matrix row.
   *
   * Built from the combination's own option pairs. The previous implementation
   * split the key on "-" and bailed out to the raw key whenever the segment
   * count disagreed with the axis count — which a hyphenated option guarantees,
   * so the console showed `16-inch-1TB` instead of `Size: 16-inch, Storage: 1TB`.
   */
  const formatVariantId = (product, variantId) => {
    const entry = entriesOf(product).find((candidate) => candidate.variantId === variantId);
    if (!entry) return variantId;
    return variantLabel(product?.variants, entry.options) || 'Default';
  };

  /** Exact price display (DB-004). Dual-reads a product that predates the migration. */
  const formatPrice = (product) => formatMoney(readMinor(product, 'priceMinor', 'price') ?? 0);

  return (
    <div className="font-michroma">
      <h1 className="text-2xl font-bold mb-5">Products</h1>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">{showArchived ? 'Archived Products' : 'All Products'}</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                className="w-4 h-4 accent-[#6a5acd]"
              />
              Show archived
            </label>
            <button
              onClick={fetchList}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className='flex flex-col gap-2'>
          <div className='hidden md:grid grid-cols-[1fr_3fr_2fr_1fr_1fr_1.5fr] items-center py-3 px-4 bg-gray-100 text-sm font-medium rounded-t-lg'>
            <span>Image</span>
            <span>Name</span>
            <span>Tags</span>
            <span>Price</span>
            <span>Inventory</span>
            <span className='text-center'>Actions</span>
          </div>

          {status === 'loading' ? (
            <div className="text-center py-6 text-gray-500" role="status" aria-live="polite">Loading products…</div>
          ) : status === 'error' ? (
            <div className="text-center py-6 text-red-600" role="alert">
              {loadError}
            </div>
          ) : visible.length > 0 ? (
            visible.map((item) => (
              <div
                key={item._id}
                className={`grid grid-cols-1 md:grid-cols-[1fr_3fr_2fr_1fr_1fr_1.5fr] items-center gap-4 py-4 px-4 border-b hover:bg-gray-50 ${item.archived ? 'opacity-60' : ''}`}
              >
                <div>
                  <img className='w-16 h-16 object-cover rounded-md' src={item.image?.[0]} alt={item.name} />
                </div>

                <div>
                  <p className="font-medium">
                    {item.name}
                    {item.archived && (
                      <span className="ml-2 px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded-full">Archived</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500 max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                    {item.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1">
                  {item.tags?.map((tag) => (
                    <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>

                <div>
                  <p className="font-medium">{formatPrice(item)}</p>
                </div>

                <div>
                  <button
                    onClick={() => openInventoryModal(item)}
                    aria-label={`Manage stock for ${item.name}`}
                    className="bg-black text-white px-3 py-1 rounded-md text-xs hover:bg-gray-800"
                  >
                    Manage Stock
                  </button>
                </div>

                <div className="flex justify-center gap-2">
                  <Link
                    to={`/edit/${item._id}`}
                    aria-label={`Edit ${item.name}`}
                    className="bg-[#6a5acd] text-white px-3 py-1 rounded-md text-xs hover:bg-[#5a4cbb]"
                  >
                    Edit
                  </Link>
                  {item.archived ? (
                    <button
                      onClick={() => handleRestore(item)}
                      aria-label={`Restore ${item.name}`}
                      className="bg-green-700 text-white px-3 py-1 rounded-md text-xs hover:bg-green-800"
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      onClick={() => setPendingArchive(item)}
                      aria-label={`Archive ${item.name}`}
                      // A11Y — axe reported `bg-red-500` + white text at 3.8:1,
                      // under the 4.5:1 AA threshold. `red-600` is 4.8:1.
                      className="bg-red-600 text-white px-3 py-1 rounded-md text-xs hover:bg-red-700"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-gray-500">
              {showArchived ? 'No archived products' : 'No products found'}
            </div>
          )}
        </div>
      </div>

      {/* ADM-003 — a confirmation that names the product and says what archiving
          does. The previous row action was a single click straight into a hard
          delete, with no dialog of any kind. */}
      {pendingArchive && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            ref={archiveDialog.ref}
            className="bg-white p-6 rounded-lg w-full max-w-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-dialog-title"
          >
            <h2 id="archive-dialog-title" className="text-xl font-bold mb-3">
              Archive “{pendingArchive.name}”?
            </h2>
            <p className="text-sm text-gray-600 mb-2">
              It will be hidden from the storefront immediately.
            </p>
            <p className="text-sm text-gray-600 mb-6">
              Existing orders that contain it are unaffected — they carry their own record of what was
              bought. You can restore it from the archived list at any time.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPendingArchive(null)}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmArchive}
                disabled={isArchiving}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-70"
              >
                {isArchiving ? 'Archiving…' : `Archive ${pendingArchive.name}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            ref={inventoryDialog.ref}
            className="bg-white p-6 rounded-lg w-full max-w-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-dialog-title"
          >
            <h2 id="inventory-dialog-title" className="text-xl font-bold mb-4">
              Update Inventory for {selectedProduct.name}
            </h2>

            <div className="mb-4 max-h-[50vh] overflow-y-auto">
              {Object.keys(inventoryEdit).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.keys(inventoryEdit).map((variantId) => {
                    const label = formatVariantId(selectedProduct, variantId);
                    return (
                      <div key={variantId} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="text-sm">{label}</div>
                        <input
                          type="number"
                          min="0"
                          value={inventoryEdit[variantId] ?? 0}
                          onChange={(e) => handleInventoryChange(variantId, e.target.value)}
                          aria-label={`Quantity for ${label}`}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-gray-500">No variants found for this product</p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={closeInventoryModal}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={saveInventoryMatrix}
                disabled={isSavingInventory}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-70"
              >
                {isSavingInventory ? 'Saving…' : 'Save inventory'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default List;
