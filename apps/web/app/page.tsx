import CommandCenter from './CommandCenter';
import evidenceData from '../data/evidence.json';
import { getEvidenceView } from '../lib/evidence';
export const dynamic = 'force-dynamic';
export default function Home() { return <CommandCenter evidence={getEvidenceView(evidenceData)} />; }
