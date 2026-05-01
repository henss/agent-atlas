import '@mantine/core/styles.css';
import '@xyflow/react/dist/style.css';
import './styles.css';

import { StrictMode, useEffect, useMemo, useState } from 'react';
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
  Drawer,
  Group,
  JsonInput,
  MantineProvider,
  NavLink,
  NumberInput,
  Paper,
  Anchor,
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
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Network,
  RefreshCw,
  Search,
} from 'lucide-react';
import type {
  AtlasUiContextPackResponse,
  AtlasUiEntityDetails,
  AtlasUiHealth,
  AtlasUiNeighborhood,
  AtlasUiOverview,
  AtlasUiPreview,
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

const PREVIEWABLE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.csv',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

type UiRoute =
  | { view: 'overview' }
  | { view: 'browse'; entityId?: AtlasEntityId }
  | { view: 'resolve' }
  | { view: 'pack' };

function App(): JSX.Element {
  const [route, setRouteState] = useState(() => parseHashRoute(window.location.hash));
  const [previewPath, setPreviewPath] = useState<string | undefined>();
  const atlas = useQuery({
    queryKey: ['atlas'],
    queryFn: () => fetchJson<AtlasUiSummary>('/api/atlas'),
  });
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: () => fetchJson<AtlasUiOverview>('/api/overview'),
  });
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => fetchJson<AtlasUiHealth>('/api/health'),
  });
  const view = route.view;
  const selectedId = route.view === 'browse' ? route.entityId : undefined;
  const setRoute = (next: UiRoute): void => {
    window.location.hash = routeToHash(next);
    setRouteState(next);
  };
  useEffect(() => {
    const onHashChange = (): void => setRouteState(parseHashRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) {
      window.location.hash = '#/overview';
    }
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (
      route.view === 'browse' &&
      route.entityId &&
      atlas.data &&
      !atlas.data.entities.some((entity) => entity.id === route.entityId)
    ) {
      setRoute({ view: 'overview' });
    }
  }, [atlas.data, route]);

  const setView = (nextView: string): void => {
    if (nextView === 'browse') {
      setRoute(selectedId ? { view: 'browse', entityId: selectedId } : { view: 'overview' });
      return;
    }
    if (nextView === 'resolve' || nextView === 'pack' || nextView === 'overview') {
      setRoute({ view: nextView });
    }
  };

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
                { label: 'Overview', value: 'overview' },
                { label: 'Browse', value: 'browse' },
                { label: 'Resolve', value: 'resolve' },
                { label: 'Pack', value: 'pack' },
              ]}
            />
            <Divider />
            {view === 'overview' || view === 'browse' ? (
              <HierarchyNav
                overview={overview.data}
                entities={atlas.data?.entities ?? []}
                selectedId={selectedId}
                onOverview={() => {
                  setRoute({ view: 'overview' });
                }}
                onSelect={(id) => {
                  setRoute({ view: 'browse', entityId: id });
                }}
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
          {view === 'overview' ? (
            <OverviewDashboard
              overview={overview.data}
              onSelect={(id) => {
                setRoute({ view: 'browse', entityId: id });
              }}
            />
          ) : null}
          {view === 'browse' && selectedId ? (
            <EntityExplorer
              entityId={selectedId}
              summary={atlas.data}
              overview={overview.data}
              onSelect={(id) => setRoute({ view: 'browse', entityId: id })}
              onPreview={setPreviewPath}
            />
          ) : null}
          {view === 'browse' && !selectedId ? (
            <Text c="dimmed">Choose a domain, workflow, or component from the navigation.</Text>
          ) : null}
          {view === 'resolve' ? <PathResolver /> : null}
          {view === 'pack' ? <ContextPackPreview /> : null}
          <PreviewDrawer path={previewPath} onClose={() => setPreviewPath(undefined)} />
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}

function HierarchyNav({
  overview,
  entities,
  selectedId,
  onOverview,
  onSelect,
}: {
  overview?: AtlasUiOverview;
  entities: AtlasEntity[];
  selectedId?: AtlasEntityId;
  onOverview: () => void;
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

  const domains = overview?.domains ?? [];

  return (
    <Stack gap="sm" h="100%">
      <NavLink
        active={!selectedId}
        component="a"
        href="#/overview"
        label="Atlas Overview"
        description="Start here"
        leftSection={<Network size={16} />}
        onClick={(event) => {
          event.preventDefault();
          onOverview();
        }}
      />
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
        {debouncedQuery || kind ? (
          filtered.map((entity) => (
            <NavLink
              key={entity.id}
              active={entity.id === selectedId}
              component="a"
              href={routeToHash({ view: 'browse', entityId: entity.id })}
              label={entity.title}
              description={`${entity.id} ${entityContextLabel(overview, entity.id)}`}
              leftSection={<KindBadge kind={entity.kind} compact />}
              onClick={(event) => {
                event.preventDefault();
                onSelect(entity.id);
              }}
            />
          ))
        ) : (
          <Stack gap={4}>
            {domains.map((domain) => (
              <NavLink
                key={domain.entity.id}
                active={domain.entity.id === selectedId}
                component="a"
                href={routeToHash({ view: 'browse', entityId: domain.entity.id })}
                label={domain.entity.title}
                description={`${domain.workflows.length} workflows`}
                leftSection={<KindBadge kind="domain" compact />}
                onClick={(event) => {
                  event.preventDefault();
                  onSelect(domain.entity.id);
                }}
              >
                {domain.workflows.map((workflow) => (
                  <NavLink
                    key={workflow.entity.id}
                    active={workflow.entity.id === selectedId}
                    component="a"
                    href={routeToHash({ view: 'browse', entityId: workflow.entity.id })}
                    label={workflow.entity.title}
                    description={`${workflow.components.length} components`}
                    leftSection={<KindBadge kind="workflow" compact />}
                    onClick={(event) => {
                      event.preventDefault();
                      onSelect(workflow.entity.id);
                    }}
                  >
                    {workflow.components.map((component) => (
                      <NavLink
                        key={component.id}
                        active={component.id === selectedId}
                        component="a"
                        href={routeToHash({ view: 'browse', entityId: component.id })}
                        label={component.title}
                        description={component.id}
                        leftSection={<KindBadge kind="component" compact />}
                        onClick={(event) => {
                          event.preventDefault();
                          onSelect(component.id);
                        }}
                      />
                    ))}
                  </NavLink>
                ))}
                {domain.components.map((component) => (
                  <NavLink
                    key={component.id}
                    active={component.id === selectedId}
                    component="a"
                    href={routeToHash({ view: 'browse', entityId: component.id })}
                    label={component.title}
                    description={component.id}
                    leftSection={<KindBadge kind="component" compact />}
                    onClick={(event) => {
                      event.preventDefault();
                      onSelect(component.id);
                    }}
                  />
                ))}
              </NavLink>
            ))}
          </Stack>
        )}
      </ScrollArea>
    </Stack>
  );
}

function OverviewDashboard({
  overview,
  onSelect,
}: {
  overview?: AtlasUiOverview;
  onSelect: (id: AtlasEntityId) => void;
}): JSX.Element {
  if (!overview) {
    return <Text c="dimmed">Loading overview...</Text>;
  }

  return (
    <Stack gap="md">
      <Box>
        <Title order={2}>Atlas Overview</Title>
        <Text c="dimmed">
          Start with domains and workflows, then drill into components, documents, and tests as needed.
        </Text>
      </Box>
      <StatsRow
        stats={[
          ['domains', overview.counts.domains],
          ['workflows', overview.counts.workflows],
          ['components', overview.counts.components],
          ['documents', overview.counts.documents],
          ['tests', overview.counts.tests],
        ]}
      />
      <Stack gap="md">
        {overview.domains.map((domain) => (
          <Card key={domain.entity.id} withBorder radius="md">
            <Group justify="space-between" align="flex-start">
              <Box>
                <Group gap="xs" mb={4}>
                  <KindBadge kind="domain" />
                  <EntityLink id={domain.entity.id} title={domain.entity.id} onSelect={onSelect} compact />
                </Group>
                <Title order={3}>{domain.entity.title}</Title>
                <Text c="dimmed">{domain.entity.summary}</Text>
              </Box>
              <Button variant="light" onClick={() => onSelect(domain.entity.id)}>
                Open
              </Button>
            </Group>
            <Divider my="md" />
            <Stack gap="sm">
              {domain.workflows.map((workflow) => (
                <Paper key={workflow.entity.id} withBorder p="sm" radius="sm">
                  <Group justify="space-between" align="flex-start">
                    <Box>
                      <Group gap="xs">
                        <KindBadge kind="workflow" />
                        <EntityLink id={workflow.entity.id} title={workflow.entity.id} onSelect={onSelect} compact />
                      </Group>
                      <Text fw={700} mt={4}>
                        {workflow.entity.title}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {workflow.entity.summary}
                      </Text>
                      {workflow.components.length > 0 ? (
                        <Group gap="xs" mt="xs">
                          {workflow.components.slice(0, 5).map((component) => (
                            <Badge
                              key={component.id}
                              component="a"
                              href={routeToHash({ view: 'browse', entityId: component.id })}
                              variant="light"
                              onClick={(event) => {
                                event.preventDefault();
                                onSelect(component.id);
                              }}
                            >
                              {component.title}
                            </Badge>
                          ))}
                        </Group>
                      ) : null}
                    </Box>
                    <Button size="xs" variant="subtle" onClick={() => onSelect(workflow.entity.id)}>
                      Drill down
                    </Button>
                  </Group>
                </Paper>
              ))}
            </Stack>
          </Card>
        ))}
      </Stack>
      {overview.otherEntities.length > 0 ? (
        <Card withBorder radius="md">
          <Title order={4}>Other entities</Title>
          <Text size="sm" c="dimmed" mb="sm">
            These entities are valid but are not placed under a domain/workflow hierarchy yet.
          </Text>
          <Group gap="xs">
            {overview.otherEntities.slice(0, 20).map((entity) => (
              <Badge
                key={entity.id}
                component="a"
                href={routeToHash({ view: 'browse', entityId: entity.id })}
                variant="outline"
                onClick={(event) => {
                  event.preventDefault();
                  onSelect(entity.id);
                }}
              >
                {entity.title}
              </Badge>
            ))}
          </Group>
        </Card>
      ) : null}
    </Stack>
  );
}

function EntityExplorer({
  entityId,
  summary,
  overview,
  onSelect,
  onPreview,
}: {
  entityId: AtlasEntityId;
  summary?: AtlasUiSummary;
  overview?: AtlasUiOverview;
  onSelect: (id: AtlasEntityId) => void;
  onPreview: (path: string) => void;
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
  const entitiesById = useMemo(
    () => new Map((summary?.entities ?? []).map((candidate) => [candidate.id, candidate])),
    [summary?.entities],
  );

  if (!entity.data) {
    return <Text c="dimmed">Loading entity...</Text>;
  }
  const drillDown = entityDrillDown(overview, entityId);

  return (
    <Stack gap="md">
      {drillDown.breadcrumb.length > 0 ? (
        <BreadcrumbText labels={drillDown.breadcrumb} />
      ) : null}
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
      <ReferencesPanel entity={entity.data.entity} onPreview={onPreview} />
      <DrillDownPanel drillDown={drillDown} onSelect={onSelect} />

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
            <GraphCanvas selectedId={entityId} neighborhood={neighborhood.data} onSelect={onSelect} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="relations" pt="md">
          <RelationsPanel details={entity.data} entitiesById={entitiesById} onSelect={onSelect} />
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

function BreadcrumbText({ labels }: { labels: string[] }): JSX.Element {
  return (
    <Group gap={6}>
      {labels.map((label, index) => (
        <Group key={`${label}-${index}`} gap={6}>
          {index > 0 ? <Text size="sm" c="dimmed">/</Text> : null}
          <Text size="sm" c="dimmed">
            {label}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

function ReferencesPanel({
  entity,
  onPreview,
}: {
  entity: AtlasEntity;
  onPreview: (path: string) => void;
}): JSX.Element | null {
  const references: JSX.Element[] = [];

  if (entity.uri) {
    references.push(
      <ReferenceRow key="uri" label="URI" value={entity.uri} onPreview={onPreview} />,
    );
  }

  for (const entrypoint of entity.code?.entrypoints ?? []) {
    references.push(
      <ReferenceRow
        key={`entrypoint-${entrypoint}`}
        label="Entrypoint"
        value={entrypoint}
        onPreview={onPreview}
      />,
    );
  }

  for (const codePath of entity.code?.paths ?? []) {
    references.push(
      <ReferenceRow
        key={`path-${codePath}`}
        label={hasGlob(codePath) ? 'Path pattern' : 'Path'}
        value={codePath}
        onPreview={onPreview}
      />,
    );
  }

  for (const command of entity.commands ?? []) {
    if (command.cwd) {
      references.push(
        <ReferenceRow
          key={`cwd-${command.command}-${command.cwd}`}
          label="Command cwd"
          value={command.cwd}
          onPreview={onPreview}
        />,
      );
    }
  }

  if (entity.access) {
    const accessItems = [
      entity.access.method ? `method: ${entity.access.method}` : undefined,
      entity.access.server ? `server: ${entity.access.server}` : undefined,
      entity.access.permission ? `permission: ${entity.access.permission}` : undefined,
      entity.access.private_overlay_required ? 'private overlay required' : undefined,
    ].filter((item): item is string => Boolean(item));
    if (accessItems.length > 0) {
      references.push(
        <Paper key="access" withBorder p="sm" radius="sm">
          <Group gap="xs" align="flex-start">
            <Badge variant="light" leftSection={<LinkIcon size={12} />}>
              Access
            </Badge>
            <Group gap="xs">
              {accessItems.map((item) => (
                <Code key={item}>{item}</Code>
              ))}
            </Group>
          </Group>
        </Paper>,
      );
    }
  }

  if (references.length === 0) {
    return null;
  }

  return (
    <Card withBorder radius="md">
      <Title order={4} mb="sm">
        References
      </Title>
      <Stack gap="xs">{references}</Stack>
    </Card>
  );
}

function ReferenceRow({
  label,
  value,
  onPreview,
}: {
  label: string;
  value: string;
  onPreview: (path: string) => void;
}): JSX.Element {
  const previewPath = previewableLocalPath(value);
  const external = hasUriScheme(value);

  return (
    <Paper withBorder p="sm" radius="sm">
      <Group justify="space-between" gap="sm" align="center">
        <Group gap="xs" wrap="nowrap">
          <Badge variant="light" leftSection={<FileText size={12} />}>
            {label}
          </Badge>
          {isHttpUrl(value) ? (
            <Anchor href={value} target="_blank" rel="noreferrer">
              {value}
            </Anchor>
          ) : external ? (
            <Group gap="xs" wrap="nowrap">
              <Anchor href={value} target="_blank" rel="noreferrer">
                {value}
              </Anchor>
              <Tooltip label="External URI scheme. The UI does not fetch this content.">
                <ExternalLink size={14} />
              </Tooltip>
            </Group>
          ) : (
            <Code>{value}</Code>
          )}
        </Group>
        {previewPath ? (
          <Button size="xs" variant="light" leftSection={<FileSearch size={14} />} onClick={() => onPreview(previewPath)}>
            Preview
          </Button>
        ) : null}
      </Group>
    </Paper>
  );
}

function DrillDownPanel({
  drillDown,
  onSelect,
}: {
  drillDown: ReturnType<typeof entityDrillDown>;
  onSelect: (id: AtlasEntityId) => void;
}): JSX.Element | null {
  const sections = [
    ['Workflows', drillDown.workflows],
    ['Components', drillDown.components],
    ['Documents', drillDown.documents],
    ['Tests', drillDown.tests],
  ] as const;
  if (sections.every(([, items]) => items.length === 0)) {
    return null;
  }

  return (
    <Card withBorder radius="md">
      <Title order={4} mb="sm">
        Drill down
      </Title>
      <Group align="flex-start" grow>
        {sections.map(([title, items]) => (
          <Box key={title}>
            <Text size="xs" c="dimmed" fw={700} mb={4}>
              {title}
            </Text>
            <Stack gap={4}>
              {items.length === 0 ? <Text size="sm" c="dimmed">None</Text> : null}
              {items.slice(0, 8).map((item) => (
                <EntityLink key={item.id} id={item.id} title={item.title} onSelect={onSelect} />
              ))}
            </Stack>
          </Box>
        ))}
      </Group>
    </Card>
  );
}

function EntityLink({
  id,
  title,
  entity,
  onSelect,
  compact = false,
}: {
  id: AtlasEntityId;
  title?: string;
  entity?: AtlasEntity;
  onSelect: (id: AtlasEntityId) => void;
  compact?: boolean;
}): JSX.Element {
  const displayTitle = title ?? entity?.title ?? id;
  return (
    <Anchor
      href={routeToHash({ view: 'browse', entityId: id })}
      onClick={(event) => {
        event.preventDefault();
        onSelect(id);
      }}
      className={compact ? 'entityLinkCompact' : 'entityLink'}
    >
      <Group gap="xs" wrap="nowrap">
        {entity ? <KindBadge kind={entity.kind} /> : null}
        <Text span size={compact ? 'xs' : 'sm'} fw={compact ? 500 : 600}>
          {displayTitle}
        </Text>
        {!compact && displayTitle !== id ? (
          <Text span size="xs" c="dimmed">
            {id}
          </Text>
        ) : null}
      </Group>
    </Anchor>
  );
}

function GraphCanvas({
  selectedId,
  neighborhood,
  onSelect,
}: {
  selectedId: AtlasEntityId;
  neighborhood?: AtlasUiNeighborhood;
  onSelect: (id: AtlasEntityId) => void;
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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.2}
        onNodeClick={(_, node) => onSelect(node.id as AtlasEntityId)}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </Paper>
  );
}

function RelationsPanel({
  details,
  entitiesById,
  onSelect,
}: {
  details: AtlasUiEntityDetails;
  entitiesById: Map<AtlasEntityId, AtlasEntity>;
  onSelect: (id: AtlasEntityId) => void;
}): JSX.Element {
  return (
    <Group align="flex-start" grow>
      <EdgeList title="Outgoing" edges={details.outgoing} targetField="target" entitiesById={entitiesById} onSelect={onSelect} />
      <EdgeList title="Incoming" edges={details.incoming} targetField="source" entitiesById={entitiesById} onSelect={onSelect} />
    </Group>
  );
}

function EdgeList({
  title,
  edges,
  targetField,
  entitiesById,
  onSelect,
}: {
  title: string;
  edges: AtlasGraphEdge[];
  targetField: 'source' | 'target';
  entitiesById: Map<AtlasEntityId, AtlasEntity>;
  onSelect: (id: AtlasEntityId) => void;
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
            <Box mt="xs">
              <EntityLink
                id={edge[targetField]}
                entity={entitiesById.get(edge[targetField])}
                onSelect={onSelect}
              />
            </Box>
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

function PreviewDrawer({
  path,
  onClose,
}: {
  path?: string;
  onClose: () => void;
}): JSX.Element {
  const preview = useQuery({
    queryKey: ['preview', path],
    queryFn: () => fetchJson<AtlasUiPreview>(`/api/preview?path=${encodeURIComponent(path ?? '')}`),
    enabled: Boolean(path),
  });

  return (
    <Drawer opened={Boolean(path)} onClose={onClose} title="Local file preview" size="xl" position="right">
      {!path ? null : (
        <Stack gap="md">
          <Box>
            <Title order={4}>{preview.data?.fileName ?? fileNameFromPath(path)}</Title>
            <Text size="sm" c="dimmed">
              {preview.data?.path ?? path}
              {preview.data ? ` - ${preview.data.sizeBytes} bytes` : ''}
            </Text>
          </Box>
          {preview.error ? (
            <Alert color="red" title="Preview unavailable" icon={<AlertTriangle size={18} />}>
              {String(preview.error)}
            </Alert>
          ) : null}
          {!preview.data && !preview.error ? <Text c="dimmed">Loading preview...</Text> : null}
          {preview.data ? <pre className="previewContent">{preview.data.content}</pre> : null}
        </Stack>
      )}
    </Drawer>
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

function entityContextLabel(overview: AtlasUiOverview | undefined, entityId: AtlasEntityId): string {
  const drillDown = entityDrillDown(overview, entityId);
  return drillDown.breadcrumb.length > 0 ? `- ${drillDown.breadcrumb.join(' / ')}` : '';
}

function entityDrillDown(
  overview: AtlasUiOverview | undefined,
  entityId: AtlasEntityId,
): {
  breadcrumb: string[];
  workflows: Array<{ id: AtlasEntityId; title: string }>;
  components: Array<{ id: AtlasEntityId; title: string }>;
  documents: Array<{ id: AtlasEntityId; title: string }>;
  tests: Array<{ id: AtlasEntityId; title: string }>;
} {
  const empty = {
    breadcrumb: [],
    workflows: [],
    components: [],
    documents: [],
    tests: [],
  };
  if (!overview) {
    return empty;
  }

  for (const domain of overview.domains) {
    if (domain.entity.id === entityId) {
      return {
        breadcrumb: [domain.entity.title],
        workflows: domain.workflows.map((workflow) => workflow.entity),
        components: domain.components,
        documents: domain.documents,
        tests: domain.tests,
      };
    }
    for (const workflow of domain.workflows) {
      if (workflow.entity.id === entityId) {
        return {
          breadcrumb: [domain.entity.title, workflow.entity.title],
          workflows: [],
          components: workflow.components,
          documents: workflow.documents,
          tests: workflow.tests,
        };
      }
      if (workflow.components.some((component) => component.id === entityId)) {
        return {
          breadcrumb: [domain.entity.title, workflow.entity.title],
          workflows: [],
          components: workflow.components,
          documents: workflow.documents,
          tests: workflow.tests,
        };
      }
    }
    if (domain.components.some((component) => component.id === entityId)) {
      return {
        breadcrumb: [domain.entity.title],
        workflows: domain.workflows.map((workflow) => workflow.entity),
        components: domain.components,
        documents: domain.documents,
        tests: domain.tests,
      };
    }
  }

  return empty;
}

function parseHashRoute(hash: string): UiRoute {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!normalized || normalized === '/' || normalized === '/overview') {
    return { view: 'overview' };
  }
  if (normalized === '/resolve') {
    return { view: 'resolve' };
  }
  if (normalized === '/pack') {
    return { view: 'pack' };
  }
  if (normalized.startsWith('/entity/')) {
    const rawId = normalized.slice('/entity/'.length);
    if (rawId.trim()) {
      return { view: 'browse', entityId: decodeURIComponent(rawId) as AtlasEntityId };
    }
  }
  return { view: 'overview' };
}

function routeToHash(route: UiRoute): string {
  if (route.view === 'browse' && route.entityId) {
    return `#/entity/${encodeURIComponent(route.entityId).replace('%3A', ':')}`;
  }
  if (route.view === 'resolve') {
    return '#/resolve';
  }
  if (route.view === 'pack') {
    return '#/pack';
  }
  return '#/overview';
}

function previewableLocalPath(value: string): string | undefined {
  if (hasUriScheme(value) || hasGlob(value) || value.startsWith('/') || value.startsWith('\\')) {
    return undefined;
  }
  const cleanPath = value.split(/[?#]/, 1)[0] ?? value;
  const extension = cleanPath.includes('.') ? `.${cleanPath.split('.').pop()?.toLowerCase() ?? ''}` : '';
  return PREVIEWABLE_EXTENSIONS.has(extension) ? cleanPath : undefined;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function hasUriScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function hasGlob(value: string): boolean {
  return value.includes('*') || value.includes('?') || value.includes('[') || value.includes(']');
}

function fileNameFromPath(value: string): string {
  return value.split('/').pop() || value;
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
