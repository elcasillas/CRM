'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

type ResultType = 'account' | 'deal' | 'hid' | 'contact'

type SearchResult = {
  type:      ResultType
  id:        string
  label:     string
  sublabel?: string
  href:      string
}

const TYPE_META: Record<ResultType, { label: string; color: string }> = {
  account: { label: 'Accounts',    color: 'text-blue-600' },
  deal:    { label: 'Deals',       color: 'text-amber-600' },
  hid:     { label: 'HID Records', color: 'text-purple-600' },
  contact: { label: 'Contacts',    color: 'text-green-600' },
}

const TYPE_ORDER: ResultType[] = ['account', 'deal', 'hid', 'contact']

export function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)
  const [cursor, setCursor]   = useState(-1)

  const inputRef    = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef    = useRef<ReturnType<typeof setTimeout>>()

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); setLoading(false); return }
    setLoading(true)

    const [accRes, dealRes, hidRes, contactRes] = await Promise.all([
      supabase
        .from('accounts')
        .select('id, account_name')
        .ilike('account_name', `%${q}%`)
        .limit(5),
      supabase
        .from('deals')
        .select('id, deal_name, account_id, accounts(account_name)')
        .ilike('deal_name', `%${q}%`)
        .limit(5),
      supabase
        .from('hid_records')
        .select('id, hid_number, domain_name, account_id, accounts(account_name)')
        .or(`hid_number.ilike.%${q}%,domain_name.ilike.%${q}%`)
        .limit(5),
      supabase
        .from('contacts')
        .select('id, first_name, last_name, email, account_id, accounts(account_name)')
        .ilike('email', `%${q}%`)
        .limit(5),
    ])

    const out: SearchResult[] = []

    for (const row of accRes.data ?? []) {
      out.push({
        type:  'account',
        id:    row.id,
        label: row.account_name,
        href:  `/dashboard/accounts/${row.id}`,
      })
    }
    for (const row of dealRes.data ?? []) {
      const acct = (row.accounts as unknown as { account_name: string } | null)?.account_name
      out.push({
        type:     'deal',
        id:       row.id,
        label:    row.deal_name,
        sublabel: acct,
        href:     row.account_id
          ? `/dashboard/accounts/${row.account_id}?tab=deals`
          : '/dashboard/deals',
      })
    }
    for (const row of hidRes.data ?? []) {
      const acct = (row.accounts as unknown as { account_name: string } | null)?.account_name
      out.push({
        type:     'hid',
        id:       row.id,
        label:    row.hid_number,
        sublabel: [row.domain_name, acct].filter(Boolean).join(' · '),
        href:     `/dashboard/accounts/${row.account_id}?tab=hids`,
      })
    }
    for (const row of contactRes.data ?? []) {
      const name    = [row.first_name, row.last_name].filter(Boolean).join(' ')
      const acct    = (row.accounts as unknown as { account_name: string } | null)?.account_name
      out.push({
        type:     'contact',
        id:       row.id,
        label:    row.email,
        sublabel: [name, acct].filter(Boolean).join(' · '),
        href:     `/dashboard/accounts/${row.account_id}?tab=contacts`,
      })
    }

    setResults(out)
    setOpen(true)
    setCursor(-1)
    setLoading(false)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    setLoading(q.length >= 2)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(q), 280)
  }

  function clear() {
    setQuery(''); setResults([]); setOpen(false); setCursor(-1)
    clearTimeout(timerRef.current)
  }

  // Flat ordered list for keyboard nav
  const flat = TYPE_ORDER.flatMap(type => results.filter(r => r.type === type))

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(c => Math.min(c + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => Math.max(c - 1, -1))
    } else if (e.key === 'Enter' && cursor >= 0 && flat[cursor]) {
      e.preventDefault()
      router.push(flat[cursor].href)
      clear()
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const grouped = TYPE_ORDER
    .map(type => ({ type, items: results.filter(r => r.type === type) }))
    .filter(g => g.items.length > 0)

  // Track flat index across groups for cursor highlight
  let flatIdx = 0

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search…"
          value={query}
          onChange={handleChange}
          onFocus={() => { if (query.length >= 2) setOpen(true) }}
          onKeyDown={handleKeyDown}
          className="w-52 bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-7 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 focus:bg-white focus:w-72 transition-all duration-150"
        />
        {query && (
          <button
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs leading-none"
            tabIndex={-1}
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {loading ? (
            <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>
          ) : grouped.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">No results for &ldquo;{query}&rdquo;</p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              {grouped.map(group => {
                const meta = TYPE_META[group.type as ResultType]
                return (
                  <div key={group.type}>
                    <div className="px-3 py-1.5 flex items-center gap-1.5 bg-gray-50 border-b border-gray-100 sticky top-0">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${meta.color}`}>
                        {meta.label}
                      </span>
                    </div>
                    {group.items.map(item => {
                      const idx = flatIdx++
                      const active = idx === cursor
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={clear}
                          className={`flex flex-col px-4 py-2.5 border-b border-gray-50 last:border-b-0 transition-colors ${active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        >
                          <span className="text-sm text-gray-900 font-medium truncate">{item.label}</span>
                          {item.sublabel && (
                            <span className="text-xs text-gray-400 truncate mt-0.5">{item.sublabel}</span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
