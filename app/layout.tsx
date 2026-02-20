import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CRM',
  description: 'AI-powered Customer Relationship Management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-slate-900 text-slate-100 min-h-screen font-sans">
        {children}
      </body>
    </html>
  )
}
