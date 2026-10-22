import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { type Rules } from '@/features/aisa/aisa.schema'

import { GradeGuide } from '../../_components/grade-guide'

/** "Cara membaca grade": the five bands of the active rules and what to do with each. */
export function GradeGuideCard({
  rules,
}: {
  rules: Pick<Rules, 'thresholds'>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">Cara membaca grade</CardTitle>
        <CardDescription>
          Skor 0–100 menentukan grade, dan tiap grade punya saran aksi. Aksi
          hanya saran; keputusan tetap di tangan Anda. Tanda “Di luar fokus”
          tidak mengubah grade, hanya menurunkan prioritas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GradeGuide thresholds={rules.thresholds} showExplanation />
      </CardContent>
    </Card>
  )
}
