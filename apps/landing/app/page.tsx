import { HumanHero } from "../components/HumanHero.tsx";
import {
  BuildTogether,
  ExamCentres,
  Footer,
  ForAlumni,
  GapNote,
  HowItWorks,
  TaskWall,
} from "../components/Sections.tsx";

export default function Home() {
  return (
    <>
      <main>
        <HumanHero />
        <div id="vision"><GapNote /></div>
        <TaskWall />
        <HowItWorks />
        <ForAlumni />
        <BuildTogether />
        <ExamCentres />
      </main>
      <Footer />
    </>
  );
}
