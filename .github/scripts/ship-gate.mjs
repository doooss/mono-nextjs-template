// 출고 게이트(ship gate) 검증 — 의존성 없음.
//
// done 으로 옮겨진 agent-work task 가 "현재 사양을 남긴다" 규칙을 지켰는지 본다.
//   - review: passed            적대적 리뷰 통과
//   - ## 최종 사양 / ## 예외 케이스 / ## 검증   압축된 작업 기록
//   - adr: NNNN | none — 사유    이번 커밋 단위 결정 기록
//   - spec: [docs/specs/...] | none — 사유   현재 사양 갱신 (page 사양이면 스크린샷까지)
//
// 파일 접근은 view 로 주입한다 (CI = 커밋 sha 시점의 git tree, 로컬 = working tree).
//   view.read(path)   → string | null
//   view.exists(path) → boolean
//   view.list(dir)    → string[]  (dir 바로 아래 파일명)
// 규칙 본문 → .claude/rules/agent-work.md

// agent-work/<epic>/done/<id>.md — archive/ 와 _templates/ 는 제외 (에픽 종료 이동은 출고가 아님)
export const DONE_TASK_RE =
  /^agent-work\/(?!archive\/|_templates\/)[^/]+\/done\/[^/]+\.md$/;
const ARCHIVED_DONE_RE = /^agent-work\/archive\/([^/]+)\/done\/([^/]+\.md)$/;

// 출고 게이트 대상 — { status: A|M|R|C|D, path, from? } (git name-status).
//   done/ 으로 들어오거나 수정된 task + archive/<epic>/done/ 에 새로 들어온 task.
//   archive 이동은 <epic>/done/ 의 같은 파일을 옮긴 rename 일 때만 출고가 아니다
//   (pending → archive/<epic>/done/ 한 번에 옮기면 게이트를 우회하므로 검사).
export function isShipTarget({ status, path, from }) {
  if (status === 'D') return false;
  if (DONE_TASK_RE.test(path)) return true;
  const m = ARCHIVED_DONE_RE.exec(path);
  if (!m || status === 'M') return false;
  return !(status === 'R' && from === `agent-work/${m[1]}/done/${m[2]}`);
}

export const REQUIRED_SECTIONS = ['최종 사양', '예외 케이스', '결정', '검증'];
// 템플릿 자리 표시자 — 채우지 않고 출고한 흔적
const PLACEHOLDER_RE =
  /\bTODO\b|\bNNNN\b|YYYY-MM-DD|<(?:task-id|slug|epic|module|route|제목|경로[^>]*)>/;
// none 사유 자리에 템플릿 단어만 남은 경우 (`none — 사유`)
const PLACEHOLDER_REASON_RE = /^<?(사유|reason)>?$/i;
export const VIEWPORTS = ['desktop', 'mobile'];
export const DEFAULT_VIEWPORTS = ['desktop'];
// 체크리스트 줄의 prod / 운영 / 배포 확인 항목 (출고 게이트에서 제외된 단계)
const PROD_CHECK_RE =
  /^\s*[-*]\s*\[[ xX]\].*(prod|운영|배포|sandbox|샌드박스).*(확인|검증|smoke)/im;

// ─── frontmatter (YAML 부분집합) ─────────────────────────────
// 지원: `key: value` · `key: [a, b]` · `key:` + `  - item` 블록 리스트 · `# 주석`

function stripComment(value) {
  return value.replace(/\s+#.*$/, '').trim();
}

function unquote(value) {
  return value.replace(/^(['"])(.*)\1$/, '$2');
}

function parseScalarOrList(raw) {
  const value = stripComment(raw);
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((v) => unquote(v.trim()))
      .filter(Boolean);
  }
  return unquote(value);
}

export function parseFrontmatter(text) {
  if (typeof text !== 'string') return null;
  const normalized = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return null;
  const head = normalized.slice(4, end);
  const afterFence = normalized.indexOf('\n', end + 1);
  const body = afterFence === -1 ? '' : normalized.slice(afterFence + 1);

  const data = {};
  let listKey = null;
  let flow = null; // 여러 줄 flow list (prettier 가 긴 [a, b] 를 줄바꿈한 형태)
  for (const line of head.split('\n')) {
    if (flow) {
      flow.buf += ` ${stripComment(line)}`;
      if (flow.buf.includes(']')) {
        data[flow.key] = parseScalarOrList(flow.buf.trim());
        flow = null;
      }
      continue;
    }
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (listKey && /^\s*\[/.test(line)) {
      flow = { key: listKey, buf: stripComment(line) };
      listKey = null;
      if (flow.buf.includes(']')) {
        data[flow.key] = parseScalarOrList(flow.buf.trim());
        flow = null;
      }
      continue;
    }
    // YAML 은 key 바로 아래 들여쓰기 없는 `- item` 도 허용
    const item = /^\s*-(?:\s+(.*))?$/.exec(line);
    if (item && listKey) {
      const v = unquote(stripComment(item[1] ?? ''));
      if (v) data[listKey].push(v);
      continue;
    }
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    if (stripComment(raw) === '') {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = parseScalarOrList(raw);
      listKey = null;
    }
  }
  return { data, body };
}

// ─── 필드 해석 ───────────────────────────────────────────────

// none · none — 사유 · none: 사유 · none 사유  (nonexistent.md 같은 경로는 제외)
const NONE_RE = /^none\b(?:\s*[—–:-]+)?\s*(.*)$/i;

function asList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// none 은 사유 필수: `none — 내부 리팩터, 외부 동작 불변`
function parseNone(list) {
  if (list.length === 0) return null;
  const joined = list.join(', ').trim();
  const m = NONE_RE.exec(joined);
  if (!m) return null;
  const reason = (m[1] ?? '').trim();
  return {
    none: true,
    reason: PLACEHOLDER_REASON_RE.test(reason) ? '' : reason,
  };
}

export function parseSpecField(value) {
  const list = asList(value)
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (list.length === 0) return { missing: true };
  const none = parseNone(list);
  if (none) return none;
  // `spec: a.md, b.md` (괄호 없는 쉼표 목록)도 허용
  return {
    paths: list
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter(Boolean),
  };
}

export function parseAdrField(value) {
  const list = asList(value)
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (list.length === 0) return { missing: true };
  const none = parseNone(list);
  if (none) return none;
  const ids = [];
  const invalid = [];
  for (const entry of list.flatMap((v) => v.split(','))) {
    const m = /^(?:ADR-)?(\d{4})\b/i.exec(entry.trim());
    if (m) ids.push(m[1]);
    else if (entry.trim()) invalid.push(entry.trim());
  }
  return { ids, invalid };
}

// `passed (2026-11-21, rounds 1)` — 템플릿 문구(`YYYY-MM-DD` · `rounds N`) 그대로면 통과 아님
export function isReviewPassed(value) {
  const v = String(asList(value)[0] ?? '').trim();
  return /^passed\b/i.test(v) && !/YYYY-MM-DD|rounds N\b/.test(v);
}

// 스크린샷 사양 = page(라우트) · component(미리보기 라우트). screenshots 필드 → 뷰포트 목록 (중복 제거).
//   필드 없음 → [desktop] · `none` / `[]` / 빈 블록 → [] (스크린샷 없음)
export function specViewports(specText) {
  const fm = parseFrontmatter(specText);
  const raw = fm?.data.screenshots;
  if (raw === undefined) return DEFAULT_VIEWPORTS;
  const list = asList(raw)
    .map((v) => String(v).trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 1 && list[0] === 'none') return [];
  return [...new Set(list)];
}

export function specSlug(specPath) {
  return specPath.split('/').pop().replace(/\.md$/, '');
}

// docs/specs/<pages|components>/<slug>.md → docs/specs/<pages|components>/assets/<slug>.<viewport>.png
export function screenshotPath(specPath, viewport) {
  const kind = specPath.split('/')[2];
  return `docs/specs/${kind}/assets/${specSlug(specPath)}.${viewport}.png`;
}

// 스크린샷 사양 1개 → 계획. spec:shots(Playwright) 와 CI 검증이 **같은 함수**를 쓴다.
//   { id: 'pages/home', kind, slug, route, shots: [{ viewport, file }], errors }
//   page 는 route 필수. component 는 스크린샷을 찍을 때만 route(미리보기 라우트) 필수.
export const SHOT_SPEC_RE = /^docs\/specs\/(pages|components)\/[^/]+\.md$/;

export function shotPlan(path, text) {
  const errors = [];
  const kind = path.split('/')[2];
  const slug = specSlug(path);
  const base = { id: `${kind}/${slug}`, kind, slug };
  if (!SHOT_SPEC_RE.test(path))
    errors.push(
      `${kind} 사양은 docs/specs/${kind}/ 바로 아래에 둔다 (하위 폴더 불가): ${path}`,
    );
  const fm = parseFrontmatter(text);
  if (!fm)
    return {
      ...base,
      route: null,
      shots: [],
      errors: [...errors, `frontmatter 없음: ${path}`],
    };
  const viewports = specViewports(text);
  const route = typeof fm.data.route === 'string' ? fm.data.route : null;
  const needsRoute = kind === 'pages' || viewports.length > 0;
  if (needsRoute && (!route || !route.startsWith('/')))
    errors.push(
      kind === 'pages'
        ? `route 없음 또는 '/' 로 시작하지 않음: ${path}`
        : `route 없음 또는 '/' 로 시작하지 않음 — 미리보기 라우트(/spec/components/${slug}) 또는 screenshots: none: ${path}`,
    );
  else if (route && /[[\]]/.test(route))
    errors.push(
      `route 는 실제 URL — 동적 세그먼트([id]) 대신 예시 값으로: ${path}`,
    );
  for (const vp of viewports)
    if (!VIEWPORTS.includes(vp))
      errors.push(
        `알 수 없는 viewport "${vp}" (${VIEWPORTS.join(' | ')} | none): ${path}`,
      );
  return {
    ...base,
    route,
    shots: viewports
      .filter((vp) => VIEWPORTS.includes(vp))
      .map((viewport) => ({ viewport, file: screenshotPath(path, viewport) })),
    errors,
  };
}

// docs/specs/{pages,components} 아래 사양 파일 (README · _* · assets 제외). 하위 폴더 파일도 반환 → shotPlan 이 거부
export function isShotSpecFile(path) {
  const m = /^docs\/specs\/(pages|components)\/(.+)$/.exec(path);
  if (!m) return false;
  const name = path.split('/').pop();
  return (
    !m[2].startsWith('assets/') &&
    name.endsWith('.md') &&
    name !== 'README.md' &&
    !name.startsWith('_')
  );
}

// ─── 변경 기준 — 바뀐 코드 → 갱신해야 할 사양 ─────────────────
export const SPEC_DIRS = [
  'docs/specs/modules',
  'docs/specs/packages',
  'docs/specs/flows',
  'docs/specs/pages',
  'docs/specs/components',
];

// view 에서 사양 문서 전부 → [{ path, text }]
export function listSpecs(view) {
  return SPEC_DIRS.flatMap((dir) =>
    view
      .list(dir)
      .filter(
        (n) => n.endsWith('.md') && n !== 'README.md' && !n.startsWith('_'),
      )
      .map((n) => ({
        path: `${dir}/${n}`,
        text: view.read(`${dir}/${n}`) ?? '',
      })),
  );
}

function resolveLink(fromPath, href) {
  const parts = fromPath.split('/').slice(0, -1);
  for (const seg of href.split('#')[0].split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

// changedPaths 와 겹치는 사양.
//   direct = frontmatter `code` 경로(파일 또는 디렉터리) 아래 파일이 바뀐 사양
//   linked = direct 사양을 본문에서 링크하는 사양 (예: 바뀐 Button 을 쓰는 page — 화면이 달라질 수 있다)
export function affectedSpecs(changedPaths, specs) {
  const changed = changedPaths.map((p) => p.replace(/\/+$/, ''));
  const direct = new Set();
  for (const { path, text } of specs) {
    const code = asList(parseFrontmatter(text)?.data.code)
      .map((c) => String(c).trim().replace(/\/+$/, ''))
      .filter(Boolean);
    if (code.some((c) => changed.some((p) => p === c || p.startsWith(`${c}/`))))
      direct.add(path);
  }
  const linked = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const { path, text } of specs) {
      if (direct.has(path) || linked.has(path)) continue;
      for (const m of text.matchAll(/\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g)) {
        const target = resolveLink(path, m[1]);
        if (direct.has(target) || linked.has(target)) {
          linked.add(path);
          grew = true;
          break;
        }
      }
    }
  }
  return { direct: [...direct].sort(), linked: [...linked].sort() };
}

// ## 헤딩 → 내용 (다음 ## 전까지)
export function sections(body) {
  const out = new Map();
  const re = /^##[ \t]+(.+?)[ \t]*$/gm;
  const marks = [...body.matchAll(re)];
  marks.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : body.length;
    out.set(m[1].trim(), body.slice(start, end).trim());
  });
  return out;
}

// 실질 내용 여부 — HTML 주석 · 빈 bullet(`-`) · 표 헤더 + 구분선만 남은 섹션 = 비어 있음
export function hasContent(text) {
  const lines = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^[-*+]\s*(\[[ xX]\])?\s*$/.test(l));
  const isSeparator = (l) => /^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*\|?$/.test(l);
  const isRow = (l) => l.startsWith('|');
  const kept = lines.filter((l, i) => {
    if (isSeparator(l)) return false;
    // 구분선 바로 위 줄 = 표 헤더
    if (isRow(l) && i + 1 < lines.length && isSeparator(lines[i + 1]))
      return false;
    // 셀이 전부 비어 있거나 첫 칸(번호)만 있는 행 (`| 1 | | | |`)
    if (isRow(l) && l.split('|').slice(2).join('').trim() === '') return false;
    return true;
  });
  return kept.length > 0;
}

export function duplicateAdrNumbers(names) {
  const seen = new Map();
  for (const name of names) {
    const m = /^(\d{4})-/.exec(name);
    if (!m) continue;
    seen.set(m[1], [...(seen.get(m[1]) ?? []), name]);
  }
  return [...seen.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([n, files]) => `${n} (${files.join(', ')})`);
}

// ─── view ────────────────────────────────────────────────────

// 테스트 / 도구용 메모리 view: { 'path': 'content' }
export function memoryView(files) {
  return {
    read: (p) => (p in files ? files[p] : null),
    exists: (p) => p in files,
    list: (dir) =>
      Object.keys(files)
        .filter(
          (p) =>
            p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'),
        )
        .map((p) => p.slice(dir.length + 1)),
  };
}

// ─── 검증 ────────────────────────────────────────────────────

export function adrExists(id, view) {
  return view.list('docs/adr').some((name) => name.startsWith(`${id}-`));
}

export function validateSpecDoc(path, view, taskId = null) {
  const errors = [];
  const warnings = [];
  if (!path.startsWith('docs/specs/') || !path.endsWith('.md')) {
    errors.push(`spec 경로는 docs/specs/**.md 여야 함: ${path}`);
    return { errors, warnings };
  }
  const text = view.read(path);
  if (text === null) {
    errors.push(`spec 파일 없음: ${path}`);
    return { errors, warnings };
  }
  const fm = parseFrontmatter(text);
  if (!fm) {
    errors.push(`spec frontmatter 없음: ${path}`);
    return { errors, warnings };
  }
  if (!fm.data.entity) warnings.push(`spec entity 미기재: ${path}`);
  if (!fm.data.updated || !fm.data.refs)
    warnings.push(`spec updated / refs 미기재: ${path}`);
  else if (taskId && fm.data.refs !== taskId)
    warnings.push(
      `spec refs(${fm.data.refs}) ≠ 이 task(${taskId}) — 이번 출고에서 사양을 갱신했다면 refs / updated 도 갱신: ${path}`,
    );
  // JS \b 는 ASCII 전용 → 한글 뒤 경계는 공백/행끝으로 판정
  if (/^##[ \t]+(변경 ?이력|Changelog|History)[ \t]*$/im.test(fm.body))
    warnings.push(
      `spec 에 이력 섹션 금지 (현재 사양만 — 이력은 git/ADR): ${path}`,
    );
  if (isShotSpecFile(path)) {
    const plan = shotPlan(path, text);
    errors.push(...plan.errors);
    for (const { file } of plan.shots)
      if (!view.exists(file))
        errors.push(`스크린샷 없음: ${file} (pnpm spec:shots)`);
  }
  return { errors, warnings };
}

export function validateShipTask(path, view) {
  const errors = [];
  const warnings = [];
  const text = view.read(path);
  if (text === null) return { errors: [`task 파일 없음: ${path}`], warnings };
  const fm = parseFrontmatter(text);
  if (!fm) return { errors: [`frontmatter 없음: ${path}`], warnings };
  const { data, body } = fm;

  const id = path.split('/').pop().replace(/\.md$/, '');
  if (data.id && data.id !== id)
    warnings.push(`frontmatter id(${data.id}) ≠ 파일명(${id})`);
  if (data.status !== 'done')
    errors.push(`status 가 done 아님 (${data.status ?? '없음'})`);

  // 1. 적대적 리뷰
  if (!isReviewPassed(data.review))
    errors.push('review: passed 아님 — 적대적 리뷰 통과 필요');

  // 2. 압축된 작업 기록
  const secs = sections(body);
  for (const name of REQUIRED_SECTIONS) {
    if (!secs.has(name)) errors.push(`## ${name} 섹션 없음`);
    else if (!hasContent(secs.get(name)))
      errors.push(
        `## ${name} 섹션 비어 있음 (빈 bullet / 헤더만 있는 표 포함)`,
      );
    // inline code(`<slug>` 같은 CLI 문법 설명)는 제외 — 채우지 않은 템플릿 문구만 잡는다
    else if (PLACEHOLDER_RE.test(secs.get(name).replace(/`[^`\n]*`/g, '')))
      warnings.push(`## ${name} 에 템플릿 자리 표시자 잔존`);
  }
  if (secs.has('메모') || secs.has('진행 로그'))
    warnings.push('과정 로그 섹션(## 메모 / ## 진행 로그) 잔존 — 압축 시 삭제');
  if (PROD_CHECK_RE.test(body))
    warnings.push(
      'prod/배포 확인 체크 항목 잔존 — 출고 게이트에서 prod 확인은 제외',
    );

  // 3. ADR
  const adr = parseAdrField(data.adr);
  if (adr.missing) errors.push('adr: 미기재 — ADR 번호 또는 `none — 사유`');
  else if (adr.none && !adr.reason) errors.push('adr: none 사유 필요');
  else if (adr.ids) {
    if (adr.invalid.length > 0)
      errors.push(`adr: 해석 불가 값 ${adr.invalid.join(', ')}`);
    for (const adrId of adr.ids)
      if (!adrExists(adrId, view))
        errors.push(`ADR 파일 없음: docs/adr/${adrId}-*.md`);
  }

  // 4. 현재 사양 (+ page 스크린샷)
  const spec = parseSpecField(data.spec);
  if (spec.missing) errors.push('spec: 미기재 — 사양 경로 또는 `none — 사유`');
  else if (spec.none && !spec.reason) errors.push('spec: none 사유 필요');
  else if (spec.paths) {
    for (const specPath of spec.paths) {
      const r = validateSpecDoc(specPath, view, id);
      errors.push(...r.errors);
      warnings.push(...r.warnings);
    }
  }

  return {
    errors,
    warnings,
    task: { id, adr, spec, review: data.review ?? null },
  };
}
