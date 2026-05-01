import '@mantine/core/styles.css';
import '@xyflow/react/dist/style.css';
import './styles.css';

import { StrictMode, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Divider,
  Group,
  JsonInput,
  MantineProvider,
  NavLink,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  rem,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import {
  AlertTriangle,
  BoxIcon,
  Braces,
  Bug,
  FileSearch,
  Filter,
  GitBranch,
  Info,
  Network,
  RefreshCw,
  Search,
} from 'lucide-react';
import type {
  AtlasUiContextPackResponse,
  AtlasUiEntityDetails,
  AtlasUiHealth,
  AtlasUiNeighborhood,
  AtlasUiResolvePathResponse,
  AtlasUiSummary,
} from '../../shared';
import type { AtlasDiagnostic, AtlasGraphEdge } from '@agent-atlas/core';
import type { AtlasEntity, AtlasEntityId } from '@agent-atlas/schema';

const queryClient = new QueryClient();

const KIND_COLORS: Record<string, string> = {
  component: 'blue',
  workflow: 'grape',
  domain: 'teal',
  document: 'yellow',
  resource: 'orange',
  repository: 'cyan',
  system: 'indigo',
  interface: 'violet',
  tool: 'pink',
  dataset: 'lime',
  'test-scope': 'red',
  'secret-scope': 'gray',
};

function App(): JSX.Element {
  const [selectedId, setSelectedId] = useState<AtlasEntityId | undefined>();
  const [view, setView] = useState('browse');
  const atlas = useQuery({
    queryKey: ['atlas'],
    queryFn: () => fetchJson<AtlasUiSummary>('/api/atlas'),
  });
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => fetchJson<AtlasUiHealth>('/api/health'),
  });

  const selectedEntityId = selectedId ?? atlas.data?.entities[0]?.id;

  return (
    <MantineProvider defaultColorScheme="auto">
      <AppShell
        header={{ height: 58 }}
        navbar={{ width: 320, breakpoint: 'sm' }}
        padding="md"
      >
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Group gap="sm">
              <ThemeIcon variant="light" size="lg">
                <Network size={20} />
              </ThemeIcon>
              <Box>
                <Title order={3}>Agent Atlas</Title>
                <Text size="xs" c="dimmed">
                  {health.data?.rootPath ?? 'Loading atlas'}
                </Text>
              </Box>
            </Group>
            <Group gap="xs">
              <Badge variant="light">{health.data?.profile ?? 'public'}</Badge>
              <DiagnosticBadges diagnostics={atlas.data?.diagnostics ?? []} />
              <Tooltip label="Refresh atlas data">
                <ActionIcon
                  variant="subtle"
                  onClick={() => {
                    void queryClient.invalidateQueries();
                  }}
                  aria-label="Refresh atlas data"
                >
                  <RefreshCw size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <Stack gap="sm" h="100%">
            <SegmentedControl
              value={view}
              onChange={setView}
              data={[
                { label: 'Browse', value: 'browse' },
                { label: 'Resolve', value: 'resolve' },
                { label: 'Pack', value: 'pack' },
              ]}
            />
            <Divider />
            {view === 'browse' ? (
              <EntityList
                entities={atlas.data?.entities ?? []}
                selectedId={selectedEntityId}
                onSelect={setSelectedId}
              />
            ) : (
              <NavLink
                active
                label={view === 'resolve' ? 'Path resolver' : 'Context pack preview'}
                description="Read-only debugging tool"
                leftSection={view === 'resolve' ? <FileSearch size={16} /> : <Bug size={16} />}
              />
            )}
          </Stack>
        </AppShell.Navbar>

        <AppShell.Main>
          {atlas.error ? (
            <Alert color="red" title="Unable to load atlas" icon={<AlertTriangle size={18} />}>
              {String(atlas.error)}
            </Alert>
          ) : null}
          {view === 'browse' && selectedEntityId ? (
            <EntityExplorer entityId={selectedEntityId} summary={atlas.data} />
          ) : null}
          {view === 'resolve' ? <PathResolver /> : null}
          {view === 'pack' ? <ContextPackPreview /> : null}
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}

function EntityList({
  entities,
  selectedId,
  onSelect,
}: {
  entities: AtlasEntity[];
  selectedId?: AtlasEntityId;
  onSelect: (id: AtlasEntityId) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [debouncedQuery] = useDebouncedValue(query, 150);
  const kinds = [...new Set(entities.map((entity) => entity.kind))].sort();
  const filtered = entities.filter((entity) => {
    const text = `${entity.id} ${entity.title} ${entity.summary} ${(entity.tags ?? []).join(' ')}`.toLowerCase();
    return (
      (!kind || entity.kind === kind) &&
      (!debouncedQuery || text.includes(debouncedQuery.toLowerCase()))
    );
  });

  return (
    <Stack gap="sm" h="100%">
      <TextInput
        placeholder="Search entities"
        leftSection={<Search size={16} />}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <Select
        placeholder="All kinds"
        clearable
        data={kinds}
        value={kind}
        onChange={setKind}
        leftSection={<Filter size={16} />}
      />
      <Text size="xs" c="dimmed">
        {filtered.length} of {entities.length} entities
      </Text>
      <ScrollArea flex={1}>
        {filtered.map((entity) => (
          <NavLink
            key={entity.id}
            active={entity.id === selectedId}
            label={entity.title}
            description={entity.id}
            leftSection={<KindBadge kind={entity.kind} compact />}
            onClick={() => onSelect(entity.id)}
          />
        ))}
      </ScrollArea>
    </Stack>
  );
}

function EntityExplorer({
  entityId,
  summary,
}: {
  entityId: AtlasEntityId;
  summary?: AtlasUiSummary;
}): JSX.Element {
  const [depth, setDepth] = useState(1);
  const [relation, setRelation] = useState('all');
  const entity = useQuery({
    queryKey: ['entity', entityId],
    queryFn: () => fetchJson<AtlasUiEntityDetails>(`/api/entity/${encodeURIComponent(entityId)}`),
  });
  const neighborhood = useQuery({
    queryKey: ['neighborhood', entityId, depth, relation],
    queryFn: () =>
      fetchJson<AtlasUiNeighborhood>(
        `/api/neighborhood/${encodeURIComponent(entityId)}?depth=${depth}&relation=${relation}`,
      ),
  });
  const relationTypes = useMemo(
    () => [...new Set(summary?.edges.map((edge) => edge.type) ?? [])].sort(),
    [summary?.edges],
  );

  if (!entity.data) {
    return <Text c="dimmed">Loading entity...</Text>;
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Group gap="xs" mb={4}>
            <KindBadge kind={entity.data.entity.kind} />
            {entity.data.entity.status ? <Badge variant="outline">{entity.data.entity.status}</Badge> : null}
            {entity.data.entity.visibility ? <Badge variant="outline">{entity.data.entity.visibility}</Badge> : null}
          </Group>
          <Title order={2}>{entity.data.entity.title}</Title>
          <Text c="dimmed">{entity.data.entity.id}</Text>
        </Box>
      </Group>
      <Text>{entity.data.entity.summary}</Text>

      <Tabs defaultValue="graph">
        <Tabs.List>
          <Tabs.Tab value="graph" leftSection={<GitBranch size={16} />}>
            Graph
          </Tabs.Tab>
          <Tabs.Tab value="relations" leftSection={<Network size={16} />}>
            Relations
          </Tabs.Tab>
          <Tabs.Tab value="metadata" leftSection={<Braces size={16} />}>
            Metadata
          </Tabs.Tab>
          <Tabs.Tab value="diagnostics" leftSection={<AlertTriangle size={16} />}>
            Diagnostics
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="graph" pt="md">
          <Stack gap="sm">
            <Group>
              <NumberInput
                label="Depth"
                min={1}
                max={4}
                w={120}
                value={depth}
                onChange={(value) => setDepth(typeof value === 'number' ? value : 1)}
              />
              <Select
                label="Relation"
                value={relation}
                onChange={(value) => setRelation(value ?? 'all')}
                data={[
                  { label: 'All relations', value: 'all' },
                  ...relationTypes.map((type) => ({ label: type, value: type })),
                ]}
                w={260}
              />
            </Group>
            {neighborhood.data?.truncated ? (
              <Alert color="yellow" icon={<Info size={18} />}>
                This neighborhood was truncated at {neighborhood.data.nodeLimit} nodes. Narrow the relation filter or reduce depth.
              </Alert>
            ) : null}
            <GraphCanvas selectedId={entityId} neighborhood={neighborhood.data} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="relations" pt="md">
          <RelationsPanel details={entity.data} />
        </Tabs.Panel>

        <Tabs.Panel value="metadata" pt="md">
          <MetadataPanel details={entity.data} />
        </Tabs.Panel>

        <Tabs.Panel value="diagnostics" pt="md">
          <DiagnosticsPanel diagnostics={entity.data.diagnostics} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function GraphCanvas({
  selectedId,
  neighborhood,
}: {
  selectedId: AtlasEntityId;
  neighborhood?: AtlasUiNeighborhood;
}): JSX.Element {
  const nodes: Node[] = useMemo(() => {
    const input = neighborhood?.nodes ?? [];
    const columns = Math.ceil(Math.sqrt(Math.max(input.length, 1)));
    return input.map((entity, index) => ({
      id: entity.id,
      position: {
        x: (index % columns) * 260,
        y: Math.floor(index / columns) * 140,
      },
      data: {
        label: entity.title,
      },
      style: {
        width: 210,
        borderRadius: 8,
        border: entity.id === selectedId ? '2px solid var(--mantine-color-blue-6)' : '1px solid var(--mantine-color-gray-4)',
        background: 'var(--mantine-color-body)',
        color: 'var(--mantine-color-text)',
        boxShadow: entity.id === selectedId ? 'var(--mantine-shadow-sm)' : undefined,
      },
    }));
  }, [neighborhood?.nodes, selectedId]);
  const edges: Edge[] = useMemo(
    () =>
      (neighborhood?.edges ?? []).map((edge) => ({
        id: `${edge.source}-${edge.type}-${edge.target}-${edge.provenance}`,
        source: edge.source,
        target: edge.target,
        label: edge.type,
        animated: edge.provenance === 'generated',
        type: 'smoothstep',
        style: {
          strokeDasharray: edge.provenance === 'generated' ? '6 4' : undefined,
        },
      })),
    [neighborhood?.edges],
  );

  return (
    <Paper withBorder h={520} radius="md" className="graphPanel">
      <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.2}>
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </Paper>
  );
}

function RelationsPanel({ details }: { details: AtlasUiEntityDetails }): JSX.Element {
  return (
    <Group align="flex-start" grow>
      <EdgeList title="Outgoing" edges={details.outgoing} targetField="target" />
      <EdgeList title="Incoming" edges={details.incoming} targetField="source" />
    </Group>
  );
}

function EdgeList({
  title,
  edges,
  targetField,
}: {
  title: string;
  edges: AtlasGraphEdge[];
  targetField: 'source' | 'target';
}): JSX.Element {
  return (
    <Card withBorder radius="md">
      <Title order={4} mb="sm">
        {title}
      </Title>
      <Stack gap="xs">
        {edges.length === 0 ? <Text c="dimmed">No relations.</Text> : null}
        {edges.map((edge) => (
          <Paper key={`${edge.source}-${edge.type}-${edge.target}-${edge.provenance}`} withBorder p="sm" radius="sm">
            <Group gap="xs">
              <Badge variant="light">{edge.type}</Badge>
              <Badge variant="outline" color={edge.provenance === 'generated' ? 'gray' : 'blue'}>
                {edge.provenance}
              </Badge>
              {edge.strength ? <Badge variant="outline">{edge.strength}</Badge> : null}
            </Group>
            <Code mt="xs" block>
              {edge[targetField]}
            </Code>
          </Paper>
        ))}
      </Stack>
    </Card>
  );
}

function MetadataPanel({ details }: { details: AtlasUiEntityDetails }): JSX.Element {
  const debug = details.metadataDebug;
  const entries = [
    ['last updated', debug.lastUpdated],
    ['provenance', debug.provenance],
    ['confidence', typeof debug.confidence === 'number' ? debug.confidence.toFixed(2) : undefined],
    ['discovered by', debug.discoveredBy],
    ['source', debug.source],
    ['review status', debug.reviewStatus],
  ].filter(([, value]) => Boolean(value));

  return (
    <Stack gap="md">
      <Card withBorder radius="md">
        <Title order={4} mb="sm">
          Debug metadata
        </Title>
        {entries.length === 0 ? (
          <Text c="dimmed">No `metadata.agent_atlas` debug fields found.</Text>
        ) : (
          <Group gap="xs">
            {entries.map(([label, value]) => (
              <Badge key={label} variant="light">
                {label}: {value}
              </Badge>
            ))}
          </Group>
        )}
      </Card>
      <JsonInput
        label="Raw metadata"
        value={JSON.stringify(debug.raw ?? {}, null, 2)}
        autosize
        minRows={8}
        readOnly
        validationError="Invalid JSON"
      />
    </Stack>
  );
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: AtlasDiagnostic[] }): JSX.Element {
  if (diagnostics.length === 0) {
    return <Text c="dimmed">No diagnostics for this entity.</Text>;
  }
  return (
    <Stack gap="sm">
      {diagnostics.map((diagnostic) => (
        <Alert
          key={`${diagnostic.code}-${diagnostic.message}`}
          color={diagnostic.level === 'error' ? 'red' : diagnostic.level === 'warning' ? 'yellow' : 'blue'}
          title={`${diagnostic.level}: ${diagnostic.code}`}
          icon={<AlertTriangle size={18} />}
        >
          {diagnostic.message}
          {diagnostic.hint ? <Text mt="xs">Fix: {diagnostic.hint}</Text> : null}
        </Alert>
      ))}
    </Stack>
  );
}

function PathResolver(): JSX.Element {
  const [path, setPath] = useState('');
  const [depth, setDepth] = useState(3);
  const result = useQuery({
    queryKey: ['resolve-path', path, depth],
    queryFn: () =>
      fetchJson<AtlasUiResolvePathResponse>(
        `/api/resolve-path?path=${encodeURIComponent(path)}&depth=${depth}`,
      ),
    enabled: path.trim().length > 0,
  });

  return (
    <Stack gap="md">
      <Title order={2}>Path Resolver</Title>
      <Group align="end">
        <TextInput
          label="Repository path"
          placeholder="packages/core/src/index.ts"
          value={path}
          onChange={(event) => setPath(event.currentTarget.value)}
          flex={1}
        />
        <NumberInput label="Depth" min={1} max={6} value={depth} onChange={(value) => setDepth(typeof value === 'number' ? value : 3)} w={120} />
      </Group>
      {result.data ? (
        <Stack gap="md">
          <StatsRow
            stats={[
              ['owners', result.data.owners.length],
              ['workflows', result.data.workflows.length],
              ['domains', result.data.domains.length],
              ['documents', result.data.documents.length],
              ['tests', result.data.tests.length],
            ]}
          />
          <JsonInput value={JSON.stringify(result.data, null, 2)} autosize minRows={18} readOnly />
        </Stack>
      ) : (
        <Text c="dimmed">Enter a path to inspect ownership and related context.</Text>
      )}
    </Stack>
  );
}

function ContextPackPreview(): JSX.Element {
  const [task, setTask] = useState('');
  const [budget, setBudget] = useState(4000);
  const mutation = useMutation({
    mutationFn: () =>
      fetchJson<AtlasUiContextPackResponse>('/api/context-pack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task, budget }),
      }),
  });

  return (
    <Stack gap="md">
      <Title order={2}>Context Pack Preview</Title>
      <TextInput
        label="Task"
        placeholder="change CLI path resolution"
        value={task}
        onChange={(event) => setTask(event.currentTarget.value)}
      />
      <Group align="end">
        <NumberInput label="Budget" min={500} value={budget} onChange={(value) => setBudget(typeof value === 'number' ? value : 4000)} w={160} />
        <Button onClick={() => mutation.mutate()} disabled={!task.trim()} leftSection={<Bug size={16} />}>
          Preview
        </Button>
      </Group>
      {mutation.data ? (
        <Stack gap="md">
          <StatsRow
            stats={[
              ['estimated tokens', mutation.data.estimatedTokens],
              ['entities', mutation.data.entities.length],
              ['reads', mutation.data.recommendedReads.length],
              ['verification', mutation.data.verification.length],
            ]}
          />
          <JsonInput value={JSON.stringify(mutation.data, null, 2)} autosize minRows={22} readOnly />
        </Stack>
      ) : (
        <Text c="dimmed">Preview why the context-pack selector includes each entity and read.</Text>
      )}
    </Stack>
  );
}

function StatsRow({ stats }: { stats: Array<[string, number]> }): JSX.Element {
  return (
    <Group>
      {stats.map(([label, value]) => (
        <Paper key={label} withBorder p="sm" radius="md" miw={150}>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
          <Text fw={700}>{value}</Text>
        </Paper>
      ))}
    </Group>
  );
}

function DiagnosticBadges({ diagnostics }: { diagnostics: AtlasDiagnostic[] }): JSX.Element {
  const counts = {
    error: diagnostics.filter((diagnostic) => diagnostic.level === 'error').length,
    warning: diagnostics.filter((diagnostic) => diagnostic.level === 'warning').length,
    info: diagnostics.filter((diagnostic) => diagnostic.level === 'info').length,
  };
  return (
    <Group gap={4}>
      <Badge color="red" variant={counts.error > 0 ? 'filled' : 'light'}>
        {counts.error} errors
      </Badge>
      <Badge color="yellow" variant={counts.warning > 0 ? 'filled' : 'light'}>
        {counts.warning} warnings
      </Badge>
      <Badge color="blue" variant="light">
        {counts.info} info
      </Badge>
    </Group>
  );
}

function KindBadge({ kind, compact = false }: { kind: string; compact?: boolean }): JSX.Element {
  const color = KIND_COLORS[kind] ?? 'gray';
  if (compact) {
    return (
      <ThemeIcon color={color} variant="light" size={rem(28)}>
        <BoxIcon size={14} />
      </ThemeIcon>
    );
  }
  return (
    <Badge color={color} variant="light">
      {kind}
    </Badge>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
