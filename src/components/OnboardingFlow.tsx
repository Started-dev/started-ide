import { useState } from 'react';
import { ArrowRight, ArrowLeft, Code2, Globe, Terminal, Boxes, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import startedLogo from '@/assets/started-logo.png';

interface Template {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  files: Array<{ path: string; content: string }>;
}

const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Blank Project',
    description: 'Start from scratch with an empty workspace.',
    icon: <Code2 className="h-6 w-6" />,
    files: [],
  },
  {
    id: 'typescript',
    name: 'TypeScript App',
    description: 'Node.js project with TypeScript, tests, and linting.',
    icon: <Terminal className="h-6 w-6" />,
    files: [
      { path: '/src/main.ts', content: `console.log('Hello from Started!');\n` },
      { path: '/tsconfig.json', content: `{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "commonjs",\n    "strict": true,\n    "outDir": "./dist"\n  },\n  "include": ["src/**/*"]\n}\n` },
      { path: '/package.json', content: `{\n  "name": "my-project",\n  "version": "1.0.0",\n  "scripts": {\n    "start": "ts-node src/main.ts",\n    "build": "tsc",\n    "test": "jest"\n  }\n}\n` },
    ],
  },
  {
    id: 'web',
    name: 'Web App',
    description: 'HTML, CSS, and JavaScript frontend starter.',
    icon: <Globe className="h-6 w-6" />,
    files: [
      { path: '/index.html', content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>My App</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <h1>Hello, World!</h1>\n  <script src="app.js"></script>\n</body>\n</html>\n` },
      { path: '/style.css', content: `body {\n  font-family: system-ui, sans-serif;\n  margin: 2rem;\n  background: #0a0a0a;\n  color: #e5e5e5;\n}\n` },
      { path: '/app.js', content: `console.log('App loaded');\n` },
    ],
  },
  {
    id: 'smart-contract',
    name: 'Smart Contract',
    description: 'Solidity project with a sample ERC-20 contract.',
    icon: <Boxes className="h-6 w-6" />,
    files: [
      { path: '/contracts/Token.sol', content: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract Token {\n    string public name = "MyToken";\n    string public symbol = "MTK";\n    uint8 public decimals = 18;\n    uint256 public totalSupply;\n    mapping(address => uint256) public balanceOf;\n\n    constructor(uint256 _supply) {\n        totalSupply = _supply * 10 ** decimals;\n        balanceOf[msg.sender] = totalSupply;\n    }\n}\n` },
      { path: '/hardhat.config.js', content: `module.exports = {\n  solidity: "0.8.20",\n};\n` },
      { path: '/package.json', content: `{\n  "name": "smart-contract",\n  "version": "1.0.0",\n  "scripts": {\n    "compile": "npx hardhat compile",\n    "test": "npx hardhat test"\n  }\n}\n` },
    ],
  },
];

interface OnboardingResult {
  projectName: string;
  templateId: string;
  templateFiles: Array<{ path: string; content: string }>;
  goal: string;
}

interface OnboardingFlowProps {
  onComplete: (result: OnboardingResult) => void;
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0); // 0=template, 1=name, 2=goal
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const template = TEMPLATES.find(t => t.id === selectedTemplate);

  const handleFinish = () => {
    if (!template || !projectName.trim()) return;
    setSubmitting(true);
    onComplete({
      projectName: projectName.trim(),
      templateId: template.id,
      templateFiles: template.files,
      goal: goal.trim(),
    });
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src={startedLogo} alt="Started" className="h-10 w-10 rounded-full" />
          <span className="text-2xl font-semibold text-foreground">Welcome to Started</span>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-primary' : i < step ? 'w-2 bg-primary/60' : 'w-2 bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Step 0: Template Picker */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold text-foreground">Pick a template</h2>
              <p className="text-sm text-muted-foreground mt-1">Choose a starting point for your project.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  className={`text-left p-4 rounded-lg border transition-all duration-200 ${
                    selectedTemplate === t.id
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                      : 'border-border bg-card hover:border-muted-foreground/30 hover:bg-accent'
                  }`}
                >
                  <div className={`mb-2 ${selectedTemplate === t.id ? 'text-primary' : 'text-muted-foreground'}`}>
                    {t.icon}
                  </div>
                  <h3 className="text-sm font-medium text-foreground">{t.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button
                disabled={!selectedTemplate}
                onClick={() => {
                  if (!projectName && template) {
                    setProjectName(template.name === 'Blank Project' ? 'my-project' : template.name.toLowerCase().replace(/\s+/g, '-'));
                  }
                  setStep(1);
                }}
                className="gap-1.5"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Project Name */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold text-foreground">Name your project</h2>
              <p className="text-sm text-muted-foreground mt-1">You can always rename it later.</p>
            </div>
            <Input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="my-awesome-project"
              className="h-11 text-sm bg-card"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && projectName.trim()) setStep(2); }}
            />
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(0)} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                disabled={!projectName.trim()}
                onClick={() => setStep(2)}
                className="gap-1.5"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: First Goal */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary mb-3">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">What do you want to build?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Describe your first task and the AI agent will get started. You can skip this.
              </p>
            </div>
            <Textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="e.g. Build a REST API with user authentication, or Create a to-do list app..."
              className="min-h-[100px] text-sm bg-card resize-none"
              autoFocus
            />
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setGoal(''); handleFinish(); }}
                  disabled={submitting}
                >
                  Skip
                </Button>
                <Button
                  onClick={handleFinish}
                  disabled={submitting}
                  className="gap-1.5"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Launch <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
