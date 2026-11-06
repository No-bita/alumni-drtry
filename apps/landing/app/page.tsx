import { Hero } from "../components/Hero.tsx";
import { Nav } from "../components/Nav.tsx";
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
      <Nav />
      <main>
        <Hero />
        <GapNote />
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
