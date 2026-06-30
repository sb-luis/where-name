import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'

export default function ContributePage() {
  return (
    <main className="h-dvh overflow-y-auto bg-[#f3f3f3] px-4 py-5 md:px-6">
      <div className="max-w-2xl mx-auto space-y-4 pb-10">

        {/* Top card */}
        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 px-5 py-3 flex items-center">
          <Link
            href="/"
            className="rounded-full px-4 py-1.5 text-sm font-semibold text-gray-600 bg-black/6 hover:bg-black/10 active:scale-95 transition-all duration-300 select-none"
          >
            where.name
          </Link>
          <p className="flex-1 text-center text-sm font-semibold text-gray-500 uppercase tracking-widest">
            contribute
          </p>
          <div className="w-[88px]" />
        </div>

        {/* About */}
        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 px-6 py-6 space-y-4">
          <p className="text-gray-700 leading-relaxed">
            I work on <b>where.name</b> during my evenings and weekends. 
            It was born from a joy for maps and learning through play. 
          </p>
          <p className="text-gray-700 leading-relaxed">
            There are hundreds of geography games out there,
            but I found none of them really captures a feeling I have when I think about earth,
            a place in which an overwhelming amount of things are happening all at once.  
          </p>
          <p className="text-gray-700 leading-relaxed">
            The movement of cursors orbiting and gliding around the globe is a constant visual reminder for me to keep working on this game.
          </p>
          <p className="text-gray-700 leading-relaxed">
            But none of this work would be possible without the support of the players who keep coming back.
            If you are one of them, and you want to keep me spinning, the best ways to contribute are linked below 🙏
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3">

          <Button
            href="https://buymeacoffee.com/luis.sb"
            target="_blank"
            rel="noopener noreferrer"
            size="lg"
          >
            <Image src="/buy-me-a-coffee.svg" alt="" width={18} height={18} className="invert" />
            buy me a coffee
          </Button>

          <Button
            href="https://github.com/sb-luis/where-name"
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            size="lg"
          >
            <Image src="/github.svg" alt="" width={18} height={18} />
            star on github
          </Button>

          <div className="flex gap-3">
            <Button
              href="https://bsky.app/profile/luis.earth"
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              size="lg"
              className="flex-1"
            >
              <Image src="/bluesky.svg" alt="" width={18} height={18} />
              bluesky
            </Button>
            <Button
              href="https://mastodon.social/@luissb"
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              size="lg"
              className="flex-1"
            >
              <Image src="/mastodon.svg" alt="" width={18} height={18} />
              mastodon
            </Button>
          </div>

        </div>
      </div>
    </main>
  )
}
