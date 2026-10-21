'use client'

import { SparklesIcon } from 'lucide-react'

import { askAssistant } from '@/components/shell/ask-event'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function AskAisaCard({ proposalName }: { proposalName: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" />
          Tanya AISA
        </CardTitle>
        <CardDescription>Siapkan diri sebelum bertemu founder.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Button
          variant="outline"
          className="justify-start"
          onClick={() =>
            askAssistant(`Buatkan pertanyaan untuk founder ${proposalName}`)
          }
        >
          Pertanyaan untuk founder
        </Button>
        <Button
          variant="outline"
          className="justify-start"
          onClick={() => askAssistant(`Apa risiko ${proposalName}?`)}
        >
          Risiko yang perlu dicek
        </Button>
      </CardContent>
    </Card>
  )
}
