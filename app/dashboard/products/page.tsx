'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

type Product = {
  id:           string
  product_name: string
  unit_price:   number
  product_code: string | null
  created_at:   string
}

type FormData = {
  product_name: string
  unit_price:   string
  product_code: string
}

const EMPTY_FORM: FormData = { product_name: '', unit_price: '', product_code: '' }

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function fmtPrice(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ProductsPage() {
  const [products,      setProducts]      = useState<Product[]>([])
  const [loading,       setLoading]       = useState(true)
  const [isAdmin,       setIsAdmin]       = useState(false)
  const [search,        setSearch]        = useState('')
  const [sortCol,       setSortCol]       = useState('product_name')
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('asc')
  const [modal,         setModal]         = useState(false)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [form,          setForm]          = useState<FormData>(EMPTY_FORM)
  const [saving,        setSaving]        = useState(false)
  const [formError,     setFormError]     = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)


  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        setIsAdmin(profile?.role === 'admin')
      }
      await fetchProducts()
      setLoading(false)
    }
    init()
  }, [])

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').order('product_name')
    setProducts((data ?? []) as Product[])
  }

  // ── Sort ────────────────────────────────────────────────────────────────────

  function toggleSort(col: string) {
    setSortCol(prev => {
      setSortDir(prev === col ? (d => d === 'asc' ? 'desc' : 'asc') : () => 'asc')
      return col
    })
  }

  const displayed = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = products.filter(p =>
      !q ||
      p.product_name.toLowerCase().includes(q) ||
      (p.product_code ?? '').toLowerCase().includes(q)
    )
    return [...filtered].sort((a, b) => {
      let va: string | number = '', vb: string | number = ''
      switch (sortCol) {
        case 'product_name': va = a.product_name; vb = b.product_name; break
        case 'product_code': va = a.product_code ?? ''; vb = b.product_code ?? ''; break
        case 'unit_price':   va = a.unit_price;   vb = b.unit_price;   break
        case 'created_at':   va = a.created_at;   vb = b.created_at;   break
      }
      const r = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDir === 'asc' ? r : -r
    })
  }, [products, search, sortCol, sortDir])

  // ── Add / Edit Product ──────────────────────────────────────────────────────

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModal(true)
  }

  function openEdit(p: Product) {
    setEditingId(p.id)
    setForm({ product_name: p.product_name, unit_price: String(p.unit_price), product_code: p.product_code ?? '' })
    setFormError(null)
    setModal(true)
  }

  function closeModal() {
    setModal(false)
    setEditingId(null)
  }

  function set(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSave() {
    const name = form.product_name.trim()
    if (!name) { setFormError('Product name is required.'); return }
    const price = parseFloat(form.unit_price)
    if (form.unit_price !== '' && (isNaN(price) || price < 0)) {
      setFormError('Unit price must be a non-negative number.')
      return
    }
    setSaving(true); setFormError(null)
    const payload = {
      product_name: name,
      unit_price:   form.unit_price.trim() !== '' ? price : 0,
      product_code: form.product_code.trim() || null,
    }
    const { error } = editingId
      ? await supabase.from('products').update(payload).eq('id', editingId)
      : await supabase.from('products').insert(payload)
    if (error) {
      setFormError(error.message)
    } else {
      closeModal()
      await fetchProducts()
    }
    setSaving(false)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    await supabase.from('products').delete().eq('id', id)
    setProducts(prev => prev.filter(p => p.id !== id))
    setConfirmDelete(null)
  }

  // ── Sort header ─────────────────────────────────────────────────────────────

  function Th({ col, label }: { col: string; label: string }) {
    const active = sortCol === col
    return (
      <th
        onClick={() => toggleSort(col)}
        className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 text-left"
      >
        {label}
        <span className={`ml-1 ${active ? 'text-gray-700' : 'text-gray-300'}`}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </th>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Products</h2>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/products/import"
            className="text-sm text-gray-500 hover:text-gray-700 font-medium border border-gray-300 px-3 py-2 rounded-lg transition-colors"
          >
            Import CSV
          </Link>
          <button
            onClick={openAdd}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + New Product
          </button>
        </div>
      </div>

      {/* Search + count */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search products…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 w-64"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-sm text-gray-400 hover:text-gray-600">Clear</button>
        )}
        {search && (
          <span className="text-sm text-gray-400">{displayed.length} of {products.length}</span>
        )}
        {!search && (
          <span className="text-sm text-gray-400">{products.length} product{products.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Table */}
      {displayed.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {search ? 'No products match your search.' : 'No products yet. Add one or import from CSV.'}
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <Th col="product_name" label="Product Name" />
                <Th col="product_code" label="Product Code" />
                <Th col="unit_price"   label="Unit Price" />
                <Th col="created_at"   label="Added" />
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map(p => (
                <tr key={p.id} className="hover:bg-brand-50 transition-colors">
                  <td className="px-4 py-3.5 max-w-xs truncate">
                    <button onClick={() => openEdit(p)} className="font-medium text-brand-600 hover:text-brand-800 hover:underline text-left truncate max-w-full">
                      {p.product_name}
                    </button>
                  </td>
                  <td className="px-4 py-3.5 text-gray-500">{p.product_code ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3.5 text-gray-700 font-medium">{fmtPrice(p.unit_price)}</td>
                  <td className="px-4 py-3.5 text-gray-400 text-xs">{fmtDate(p.created_at)}</td>
                  <td className="px-4 py-3.5">
                    {isAdmin && (
                      <div className="flex items-center gap-3 justify-end">
                        {confirmDelete === p.id ? (
                          <>
                            <span className="text-xs text-gray-400">Delete?</span>
                            <button onClick={() => handleDelete(p.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                            <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(p.id)}
                            title="Delete"
                            className="text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 9.66 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Product modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 bg-brand-700 rounded-t-xl">
              <h3 className="font-semibold text-white">{editingId ? 'Edit Product' : 'New Product'}</h3>
              <button onClick={closeModal} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Product Name *">
                <input
                  type="text"
                  value={form.product_name}
                  onChange={set('product_name')}
                  placeholder="e.g. OneList Plus INT"
                  className={INPUT}
                  autoFocus
                  readOnly={editingId !== null && !isAdmin}
                />
              </Field>
              <Field label="Unit Price">
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm pointer-events-none">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unit_price}
                    onChange={set('unit_price')}
                    placeholder="0.00"
                    className={`${INPUT} pl-6`}
                    readOnly={editingId !== null && !isAdmin}
                  />
                </div>
              </Field>
              <Field label="Product Code">
                <input
                  type="text"
                  value={form.product_code}
                  onChange={set('product_code')}
                  placeholder="e.g. ISPEMAIL (optional)"
                  className={INPUT}
                  readOnly={editingId !== null && !isAdmin}
                />
              </Field>
              {formError && <p className="text-red-600 text-sm font-medium">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={closeModal} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
                {editingId && !isAdmin ? 'Close' : 'Cancel'}
              </button>
              {isAdmin && (
                <button
                  onClick={handleSave}
                  disabled={saving || !form.product_name.trim()}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
