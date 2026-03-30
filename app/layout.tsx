import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hostopia | CRM',
  description: 'AI-powered Customer Relationship Management',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
