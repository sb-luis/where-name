import Image from 'next/image'
import Link from 'next/link'

export function Footer() {
  return (
    <footer className="shrink-0 justify-end pr-7 flex h-10 border-t border-gray-200 items-center">
      <Link
        href="/contribute"
        className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors"
      >
        contribute 🙏
      </Link>
    </footer>
  )
}
