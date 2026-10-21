'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  BotIcon,
  FileTextIcon,
  MoonIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SunIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { askAssistant } from './ask-event'

import { type ShellProposal } from './shell-data'

export interface CommandPage {
  href: string
  title: string
  icon: ReactNode
}

interface CommandMenuProps {
  pages: CommandPage[]
  proposals: ShellProposal[]
}

const RULES_HREF = '/aturan'

/**
 * Every typed word must appear in the item, in any order. cmdk's default is a
 * fuzzy subsequence score, under which "kopi" matched a startup whose text
 * merely held k…o…p…i in order.
 */
function matchesEveryWord(value: string, search: string): number {
  const text = value.toLowerCase()
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word))
    ? 1
    : 0
}

/** Global search (⌘K / Ctrl+K): the pages this role can open, every loaded proposal, and a few commands. */
export function CommandMenu({ pages, proposals }: CommandMenuProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const run = (action: () => void) => {
    setOpen(false)
    setSearch('')
    action()
  }

  return (
    <>
      <button
        className="a-search"
        type="button"
        aria-label="Cari proposal"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="a-ic" />
        <span className="flex-1 text-left">Cari proposal</span>
        <KbdGroup className="hidden sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          // A closed search starts empty next time, however it was closed.
          if (!next) setSearch('')
        }}
        title="Pencarian"
        description="Cari halaman, proposal, atau perintah"
      >
        <Command filter={matchesEveryWord}>
          <CommandInput
            placeholder="Ketik untuk mencari…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>Tidak ada hasil.</CommandEmpty>
            <CommandGroup heading="Halaman">
              {pages.map((page) => (
                <CommandItem
                  key={page.href}
                  value={`halaman ${page.title}`}
                  onSelect={() => run(() => router.push(page.href))}
                >
                  {page.icon}
                  {page.title}
                </CommandItem>
              ))}
            </CommandGroup>
            {/* Proposals appear only once the reader types, so the list stays short. */}
            {search && proposals.length > 0 ? (
              <CommandGroup heading="Proposal">
                {proposals.map((proposal) => (
                  <CommandItem
                    key={proposal.id}
                    value={[
                      proposal.name,
                      proposal.founder,
                      proposal.sector,
                      proposal.categoryLabel,
                      proposal.id,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onSelect={() =>
                      run(() => router.push(`/proposal/${proposal.id}`))
                    }
                  >
                    <FileTextIcon />
                    <span className="truncate">{proposal.name}</span>
                    {proposal.sector || proposal.categoryLabel ? (
                      <CommandShortcut className="text-muted-foreground">
                        {[proposal.sector, proposal.categoryLabel]
                          .filter(Boolean)
                          .join(' · ')}
                      </CommandShortcut>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Perintah">
              {pages.some((page) => page.href === RULES_HREF) ? (
                <CommandItem
                  value="aturan penilaian bobot kriteria"
                  onSelect={() => run(() => router.push(RULES_HREF))}
                >
                  <SlidersHorizontalIcon />
                  Atur aturan penilaian
                </CommandItem>
              ) : null}
              <CommandItem
                value="tanya asisten ai"
                onSelect={() =>
                  run(() => askAssistant('Ringkas peluang minggu ini'))
                }
              >
                <BotIcon />
                Tanya asisten
              </CommandItem>
              <CommandItem
                value="ganti tema gelap terang"
                onSelect={() => run(() => setTheme(dark ? 'light' : 'dark'))}
              >
                {dark ? <SunIcon /> : <MoonIcon />}
                {dark ? 'Gunakan mode terang' : 'Gunakan mode gelap'}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
