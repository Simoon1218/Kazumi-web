"use strict";

/* ==========================================================================
 * Kazumi-web Extended Pages:
 *  - Rule Editor (/my/rules/edit) — 4 Sections + Raw JSON Mode
 *  - Rule Tester (/my/rules/test) — Search -> Chapters -> Video Resolve
 *  - Trace.moe Image Search (/search/image) — Upload / Paste / URL
 *  - Master-Detail Settings Center (/settings & /settings/:cat)
 * ========================================================================== */

function _emptyRuleTemplate() {
  return {
    api: "9",
    type: "anime",
    name: "",
    version: "1.0",
    muliSources: true,
    useWebview: true,
    useNativePlayer: true,
    usePost: false,
    useLegacyParser: false,
    adBlocker: false,
    userAgent: "",
    baseURL: "",
    referer: "",
    searchMode: "xpath",
    searchURL: "",
    searchList: "",
    searchName: "",
    searchResult: "",
    searchResponseType: "json",
    searchResultFormat: "nested",
    searchResultDelimiter: ",",
    searchNameIndex: 0,
    searchSrcIndex: 1,
    searchHeaders: {},
    chapterMode: "xpath",
    chapterRoads: "",
    chapterResult: "",
    chapterURL: "",
    chapterResponseType: "json",
    chapterResultFormat: "nested",
    chapterResultDelimiter: ",",
    chapterNameIndex: 0,
    chapterSrcIndex: 1,
    chapterHeaders: {},
    antiCrawlerConfig: {
      enabled: false,
      captchaType: 1,
      captchaImage: "",
      captchaInput: "",
      captchaButton: "",
      captchaScript: "",
    },
  };
}

/* ==========================================================================
 * RULE EDITOR (/my/rules/edit)
 * ========================================================================== */
function renderRuleEditor(app, params) {
  renderNavRail("my");
  const editName = params.name || "";
  let draft = _emptyRuleTemplate();
  let activeTab = "basic"; // basic | search | chapter | advanced
  let rawJsonMode = false;

  const modeBtn = button("JSON 模式", () => {
    rawJsonMode = !rawJsonMode;
    modeBtn.querySelector("span:last-child").textContent = rawJsonMode ? "表单模式" : "JSON 模式";
    renderEditor();
  }, { variant: "tonal", small: true, icon: "code" });

  const bar = appBar({
    title: editName ? "编辑规则 · " + editName : "新建规则",
    compact: true,
    back: true,
    actions: [modeBtn],
  });

  const body = el("div", { class: "page narrow" }, loadingNode("加载规则编辑器…"));
  app.append(bar, body);

  function textFieldGroup(label, key, opts = {}) {
    const val = opts.getter ? opts.getter() : (draft[key] ?? "");
    const tag = opts.multiline ? "textarea" : "input";
    const inp = el(tag, {
      class: "text-field" + (opts.mono ? " mono" : ""),
      value: String(val),
      placeholder: opts.placeholder || "",
      rows: opts.multiline ? (opts.rows || 3) : undefined,
      type: opts.type || (opts.multiline ? undefined : "text"),
    });
    if (opts.multiline) inp.value = String(val);
    inp.addEventListener("input", () => {
      if (opts.setter) opts.setter(inp.value);
      else draft[key] = opts.type === "number" ? Number(inp.value || 0) : inp.value;
    });
    return el("div", { class: "field-group" },
      el("div", { class: "field-label" }, label),
      inp,
      opts.helper ? el("div", { class: "field-helper" }, opts.helper) : null
    );
  }

  function selectFieldGroup(label, key, options, onAfter) {
    const sel = el("select", { class: "text-field" },
      ...options.map((o) => el("option", { value: o.value }, o.label))
    );
    sel.value = String(draft[key] ?? options[0].value);
    sel.addEventListener("change", () => {
      draft[key] = sel.value;
      if (onAfter) onAfter(sel.value);
    });
    return el("div", { class: "field-group" }, el("div", { class: "field-label" }, label), sel);
  }

  function renderEditor() {
    body.innerHTML = "";
    if (rawJsonMode) {
      const jsonArea = el("textarea", { class: "text-field mono", rows: 22 });
      jsonArea.value = JSON.stringify(draft, null, 2);
      const errHint = el("div", { class: "field-hint" });
      jsonArea.addEventListener("input", () => {
        try {
          draft = Object.assign(_emptyRuleTemplate(), JSON.parse(jsonArea.value));
          errHint.textContent = "";
        } catch (e) {
          errHint.textContent = "JSON 语法错误：" + e.message;
        }
      });
      body.append(
        el("div", { class: "t-body-small c-variant", style: { marginBottom: "10px" } }, "直接编辑完整 Kazumi v9 规则 JSON"),
        jsonArea,
        errHint
      );
    } else {
      const tabs = [
        { id: "basic", label: "基本" },
        { id: "search", label: "搜索" },
        { id: "chapter", label: "选集" },
        { id: "advanced", label: "高级 / 反爬" },
      ];
      body.append(el("div", { class: "ctabs", style: { marginBottom: "16px" } },
        ...tabs.map((t) => el("button", {
          type: "button",
          class: "ctab" + (activeTab === t.id ? " is-active" : ""),
          onClick: () => { activeTab = t.id; renderEditor(); },
        }, t.label))
      ));

      if (activeTab === "basic") {
        body.append(
          textFieldGroup("规则名称 *", "name", { placeholder: "例如 AnimeSite" }),
          textFieldGroup("规则版本号", "version", { placeholder: "1.0" }),
          textFieldGroup("网站主域名 (baseURL) *", "baseURL", { placeholder: "https://example.com", mono: true }),
          textFieldGroup("自定义 Referer（可选）", "referer", { placeholder: "默认使用 baseURL", mono: true }),
          textFieldGroup("自定义 User-Agent（可选）", "userAgent", { placeholder: "留空自动随机 UA", mono: true }),
          section("解析选项", splitList([
            switchTile({ title: "启用多线路 (muliSources)", checked: !!draft.muliSources, onChange: (v) => { draft.muliSources = v; } }),
            switchTile({ title: "启用 HLS 广告过滤 (adBlocker)", checked: !!draft.adBlocker, onChange: (v) => { draft.adBlocker = v; } }),
            switchTile({ title: "使用 POST 方式搜索 (usePost)", checked: !!draft.usePost, onChange: (v) => { draft.usePost = v; } }),
            switchTile({ title: "启用旧版 iframe 解析器 (useLegacyParser)", checked: !!draft.useLegacyParser, onChange: (v) => { draft.useLegacyParser = v; } }),
            switchTile({ title: "原生播放器直连 (useNativePlayer)", checked: !!draft.useNativePlayer, onChange: (v) => { draft.useNativePlayer = v; } }),
          ], { tight: true }))
        );
      } else if (activeTab === "search") {
        body.append(
          selectFieldGroup("搜索模式 (searchMode)", "searchMode", [
            { value: "xpath", label: "XPath 网页解析 (xpath)" },
            { value: "api", label: "JSON API 解析 (api)" },
          ], () => renderEditor()),
          textFieldGroup("搜索 URL (使用 @keyword 占位) *", "searchURL", { placeholder: "https://example.com/search?wd=@keyword", mono: true }),
          textFieldGroup(draft.searchMode === "api" ? "列表 JSONPath (searchList)" : "结果列表 XPath (searchList)", "searchList", { placeholder: draft.searchMode === "api" ? "$.list[*]" : "//div[@class='item']", mono: true }),
          textFieldGroup(draft.searchMode === "api" ? "名称 JSONPath (searchName)" : "标题 XPath (searchName)", "searchName", { placeholder: draft.searchMode === "api" ? "$.vod_name" : ".//a/text()", mono: true }),
          textFieldGroup(draft.searchMode === "api" ? "链接 JSONPath (searchResult)" : "链接 XPath (searchResult)", "searchResult", { placeholder: draft.searchMode === "api" ? "$.vod_id" : ".//a/@href", mono: true })
        );
        if (draft.searchMode === "api") {
          body.append(
            selectFieldGroup("结果结构格式", "searchResultFormat", [
              { value: "nested", label: "嵌套对象 (nested)" },
              { value: "delimited", label: "分隔符字符串 (delimited)" },
            ], () => renderEditor()),
            draft.searchResultFormat === "delimited"
              ? el("div", {},
                  textFieldGroup("分隔符", "searchResultDelimiter", { placeholder: ",", mono: true }),
                  textFieldGroup("名称索引", "searchNameIndex", { type: "number" }),
                  textFieldGroup("链接索引", "searchSrcIndex", { type: "number" })
                )
              : null
          );
        }
      } else if (activeTab === "chapter") {
        body.append(
          selectFieldGroup("选集模式 (chapterMode)", "chapterMode", [
            { value: "xpath", label: "XPath 网页解析 (xpath)" },
            { value: "api", label: "JSON API 解析 (api)" },
          ], () => renderEditor()),
          draft.chapterMode === "api"
            ? textFieldGroup("剧集接口 URL (使用 @src 占位)", "chapterURL", { placeholder: "https://example.com/api/detail?id=@src", mono: true })
            : null,
          textFieldGroup(draft.chapterMode === "api" ? "线路列表 JSONPath (chapterRoads)" : "播放线路 XPath (chapterRoads)", "chapterRoads", { placeholder: draft.chapterMode === "api" ? "$.play_from[*]" : "//ul[@class='episodes']", mono: true }),
          textFieldGroup(draft.chapterMode === "api" ? "分集字段 JSONPath (chapterResult)" : "分集链接 XPath (chapterResult)", "chapterResult", { placeholder: draft.chapterMode === "api" ? "$.urls[*]" : ".//a", mono: true })
        );
        if (draft.chapterMode === "api") {
          body.append(
            selectFieldGroup("分集结构格式", "chapterResultFormat", [
              { value: "nested", label: "嵌套对象 (nested)" },
              { value: "delimited", label: "分隔符字符串 (delimited)" },
            ], () => renderEditor()),
            draft.chapterResultFormat === "delimited"
              ? el("div", {},
                  textFieldGroup("分集分隔符", "chapterResultDelimiter", { placeholder: "$", mono: true }),
                  textFieldGroup("分集名称索引", "chapterNameIndex", { type: "number" }),
                  textFieldGroup("分集地址索引", "chapterSrcIndex", { type: "number" })
                )
              : null
          );
        }
      } else if (activeTab === "advanced") {
        const anti = draft.antiCrawlerConfig || (draft.antiCrawlerConfig = { enabled: false, captchaType: 1, captchaImage: "", captchaInput: "", captchaButton: "", captchaScript: "" });
        body.append(
          section("反反爬虫 / 验证码配置", splitList([
            switchTile({
              title: "启用人机验证支持 (antiCrawlerConfig)",
              desc: "适用于检索触发图片验证码或点击验证的站点",
              checked: !!anti.enabled,
              onChange: (v) => { anti.enabled = v; renderEditor(); },
            }),
          ])),
          anti.enabled ? el("div", {},
            el("div", { class: "field-group" },
              el("div", { class: "field-label" }, "验证方式 (captchaType)"),
              (() => {
                const s = el("select", { class: "text-field" },
                  el("option", { value: "1" }, "1 · 图片验证码（人工输入）"),
                  el("option", { value: "2" }, "2 · 自动点击验证按钮"),
                  el("option", { value: "3" }, "3 · 执行自定义 JS 脚本")
                );
                s.value = String(anti.captchaType || 1);
                s.addEventListener("change", () => { anti.captchaType = Number(s.value); renderEditor(); });
                return s;
              })()
            ),
            anti.captchaType === 1 ? textFieldGroup("验证码图片 XPath", "", { getter: () => anti.captchaImage || "", setter: (v) => { anti.captchaImage = v; }, mono: true }) : null,
            anti.captchaType === 1 ? textFieldGroup("验证码输入框 XPath", "", { getter: () => anti.captchaInput || "", setter: (v) => { anti.captchaInput = v; }, mono: true }) : null,
            anti.captchaType <= 2 ? textFieldGroup("提交/确认按钮 XPath", "", { getter: () => anti.captchaButton || "", setter: (v) => { anti.captchaButton = v; }, mono: true }) : null,
            anti.captchaType === 3 ? textFieldGroup("自定义验证 JS", "", { getter: () => anti.captchaScript || "", setter: (v) => { anti.captchaScript = v; }, multiline: true, mono: true }) : null
          ) : null
        );
      }
    }

    const bottomBar = el("div", { class: "editor-bottom-bar" },
      button("在线测试规则", () => {
        sessionStorage.setItem("kazumi_rule_draft", JSON.stringify(draft));
        go("/my/rules/test?draft=1");
      }, { variant: "tonal", icon: "bug_report" }),
      button("保存规则", async () => {
        if (!draft.name || !draft.name.trim()) { toast("请填写规则名称"); return; }
        if (!draft.baseURL || !draft.baseURL.trim()) { toast("请填写网站主域名 baseURL"); return; }
        try {
          await fetchJsonPut("/api/plugins", { plugin: draft });
          await KazumiStore.refreshLocalPluginsFromServer();
          toast("规则「" + draft.name + "」已保存");
          go("/my/rules");
        } catch (e) { toast(e.message); }
      }, { icon: "check" })
    );
    body.append(bottomBar);
  }

  (async () => {
    if (editName) {
      try {
        const res = await fetchJson("/api/plugins/" + encodeURIComponent(editName));
        if (res && res.plugin) draft = Object.assign(_emptyRuleTemplate(), res.plugin);
      } catch (e) {
        toast("读取规则失败：" + e.message);
      }
    }
    renderEditor();
  })();
}

/* ==========================================================================
 * RULE TESTER (/my/rules/test)
 * ========================================================================== */
function renderRuleTester(app, params) {
  renderNavRail("my");
  const bar = appBar({ title: "规则测试器", compact: true, back: true });
  const body = el("div", { class: "page narrow" }, loadingNode("加载规则…"));
  app.append(bar, body);

  let plugins = [];
  let selectedPlugin = null;

  (async () => {
    try {
      plugins = await fetchJson("/api/plugins?full=1");
    } catch (_) {
      plugins = KazumiStore.getPlugins();
    }
    if (params.draft === "1") {
      try {
        const raw = sessionStorage.getItem("kazumi_rule_draft");
        if (raw) {
          const d = JSON.parse(raw);
          selectedPlugin = d;
          plugins = [Object.assign({}, d, { _isDraft: true }), ...plugins.filter((p) => p.name !== d.name)];
        }
      } catch (_) {}
    }
    if (!selectedPlugin && params.name) {
      selectedPlugin = plugins.find((p) => p.name === params.name) || null;
    }
    if (!selectedPlugin && plugins.length) selectedPlugin = plugins[0];

    renderTesterUI();
  })();

  function renderTesterUI() {
    body.innerHTML = "";
    if (!selectedPlugin) {
      body.append(emptyState({ icon: "bug_report", title: "暂无可测试的规则", actions: [button("去新建规则", () => go("/my/rules/edit"))] }));
      return;
    }

    const ruleSel = el("select", { class: "text-field" },
      ...plugins.map((p, i) => el("option", { value: String(i) }, (p._isDraft ? "[草稿] " : "") + (p.name || "未命名规则")))
    );
    ruleSel.value = String(Math.max(0, plugins.indexOf(selectedPlugin)));
    ruleSel.addEventListener("change", () => { selectedPlugin = plugins[Number(ruleSel.value)]; });

    const kwInput = el("input", { class: "text-field", value: "进击的巨人", placeholder: "输入测试搜索关键词…" });
    const searchOut = el("div", { style: { marginTop: "14px" } });
    const chapterOut = el("div", { style: { marginTop: "14px" } });
    const resolveOut = el("div", { style: { marginTop: "14px" } });

    async function runSearchTest() {
      const kw = kwInput.value.trim();
      if (!kw) { toast("请输入测试关键词"); return; }
      searchOut.innerHTML = "";
      chapterOut.innerHTML = "";
      resolveOut.innerHTML = "";
      searchOut.append(inlineLoading("Step 1 · 正在测试搜索规则…"));
      try {
        const res = await fetchJsonPost("/api/rules/test/search", { plugin: selectedPlugin, keyword: kw });
        searchOut.innerHTML = "";
        const items = res.items || [];
        searchOut.append(section("Step 1 · 搜索结果（HTTP " + res.statusCode + " · 共 " + items.length + " 条）",
          el("div", {},
            el("div", { class: "t-body-small c-variant mono", style: { marginBottom: "8px", wordBreak: "break-all" } }, "请求 URL: " + (res.requestUrl || "")),
            (res.diagnostics || []).length ? el("div", { class: "code-preview", style: { marginBottom: "10px" } }, res.diagnostics.join("\n")) : null,
            items.length
              ? splitList(items.slice(0, 10).map((it) => splitRow(
                  tile({
                    title: it.name,
                    desc: it.src,
                    chevron: true,
                    onClick: () => runChaptersTest(it),
                  })
                )), { tight: true })
              : el("div", { class: "code-preview" }, res.rawPreview || "无结果，请检查 searchList / searchName / searchResult 表达式")
          )
        ));
      } catch (e) {
        searchOut.innerHTML = "";
        searchOut.append(errorState(e, runSearchTest, { compact: true }));
      }
    }

    async function runChaptersTest(item) {
      chapterOut.innerHTML = "";
      resolveOut.innerHTML = "";
      chapterOut.append(inlineLoading("Step 2 · 正在解析《" + item.name + "》的线路与选集…"));
      try {
        const res = await fetchJsonPost("/api/rules/test/chapters", { plugin: selectedPlugin, src: item.src });
        chapterOut.innerHTML = "";
        const roads = res.roads || [];
        const rows = [];
        roads.forEach((r, rIdx) => {
          const eps = typeof extractRoadEpisodes === "function" ? extractRoadEpisodes(r) : [];
          eps.slice(0, 5).forEach((ep) => {
            rows.push(splitRow(tile({
              title: (r.name || ("线路 " + (rIdx + 1))) + " · " + ep.name,
              desc: ep.url,
              chevron: true,
              onClick: () => runResolveTest(ep.url, ep.name, item),
            })));
          });
        });
        chapterOut.append(section("Step 2 · 选集解析（HTTP " + res.statusCode + " · " + roads.length + " 条线路）",
          el("div", {},
            el("div", { class: "t-body-small c-variant mono", style: { marginBottom: "8px", wordBreak: "break-all" } }, "请求 URL: " + (res.requestUrl || "")),
            rows.length ? splitList(rows, { tight: true }) : el("div", { class: "code-preview" }, (res.diagnostics || []).join("\n") + "\n\n" + (res.rawPreview || ""))
          )
        ));
      } catch (e) {
        chapterOut.innerHTML = "";
        chapterOut.append(errorState(e, () => runChaptersTest(item), { compact: true }));
      }
    }

    async function runResolveTest(epUrl, epName, item) {
      resolveOut.innerHTML = "";
      resolveOut.append(inlineLoading("Step 3 · 正在测试视频流嗅探解析…"));
      try {
        const res = await fetchJsonPost("/api/rules/test/resolve", { plugin: selectedPlugin, episodeUrl: epUrl });
        resolveOut.innerHTML = "";
        resolveOut.append(section("Step 3 · 视频流解析成功！",
          el("div", { class: "tonal-card" },
            el("div", { class: "t-title-small w700 c-primary" }, "解析方式：" + (res.resolveMethod === "static" ? "静态极速提取" : "Playwright 无头浏览器") + " · " + (res.streamType || "").toUpperCase()),
            el("div", { class: "code-preview", style: { marginTop: "8px" } }, "原始地址：\n" + res.originalUrl + "\n\n代理播放地址：\n" + location.origin + res.playUrl),
            !selectedPlugin._isDraft ? el("div", { style: { marginTop: "10px", display: "flex", gap: "8px" } },
              button("立即试播", () => go(playEpisodeParams({
                plugin: selectedPlugin.name,
                src: item.src,
                title: item.name,
                episode: 1,
                episodeUrl: epUrl,
                episodeName: epName,
              })), { small: true, icon: "play" })
            ) : el("div", { class: "t-body-small c-variant", style: { marginTop: "8px" } }, "草稿规则测试通过，返回编辑器保存后即可正常播放。")
          )
        ));
      } catch (e) {
        resolveOut.innerHTML = "";
        resolveOut.append(errorState(e, () => runResolveTest(epUrl, epName, item), { compact: true }));
      }
    }

    kwInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearchTest(); });

    body.append(
      el("div", { class: "field-group" }, el("div", { class: "field-label" }, "选择要测试的规则"), ruleSel),
      el("div", { class: "field-row" }, kwInput, button("运行搜索测试", runSearchTest, { icon: "play" })),
      searchOut, chapterOut, resolveOut
    );
  }
}

/* ==========================================================================
 * TRACE.MOE VISUAL ANIME SEARCH (/search/image)
 * ========================================================================== */
function renderImageSearch(app) {
  renderNavRail("");
  const bar = appBar({ title: "以图搜番 (trace.moe)", compact: true, back: true });
  const body = el("div", { class: "page narrow" });
  app.append(bar, body);

  const fileInput = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  const urlInput = el("input", { class: "text-field", placeholder: "或粘贴动画截图图片 URL（https://...）" });
  const resultArea = el("div", { style: { marginTop: "18px" } });

  const dropzone = el("div", { class: "trace-dropzone sl", onClick: () => fileInput.click() },
    iconNode("image_search"),
    el("div", { class: "t-title-medium w700", style: { marginTop: "10px" } }, "点击选择截图、拖拽图片至此，或按 Ctrl+V 直接粘贴"),
    el("div", { class: "t-body-small c-variant", style: { marginTop: "4px" } }, "支持 JPG / PNG / WebP 动画截图，识别准确集数与时间点")
  );

  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("is-dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) uploadFile(f);
  });
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) uploadFile(f);
  });

  const onPaste = (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) { uploadFile(f); break; }
      }
    }
  };
  window.addEventListener("paste", onPaste);
  registerCleanup(() => window.removeEventListener("paste", onPaste));

  async function uploadFile(file) {
    resultArea.innerHTML = "";
    resultArea.append(loadingNode("正在上传截图并检索 trace.moe 帧库…"));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/trace/upload", { method: "POST", body: fd }).then(_handleJsonResponse);
      renderResults(res);
    } catch (e) {
      resultArea.innerHTML = "";
      resultArea.append(errorState(e));
    }
  }

  async function searchByUrl() {
    const u = urlInput.value.trim();
    if (!u) { toast("请输入图片 URL"); return; }
    resultArea.innerHTML = "";
    resultArea.append(loadingNode("正在解析远程截图并检索 trace.moe…"));
    try {
      const res = await fetchJsonPost("/api/trace/url", { url: u });
      renderResults(res);
    } catch (e) {
      resultArea.innerHTML = "";
      resultArea.append(errorState(e, searchByUrl));
    }
  }

  function renderResults(res) {
    resultArea.innerHTML = "";
    const list = res.results || [];
    if (!list.length) {
      resultArea.append(emptyState({ icon: "image_search", title: "未能识别到匹配的动画画面", message: res.error || "请尝试使用无黑边、无字幕遮挡的原始截图" }));
      return;
    }
    const grid = el("div", { class: "trace-grid" });
    for (const item of list.slice(0, 10)) {
      const bestTitle = item.titleNative || item.titleRomaji || item.titleEnglish || item.filename;
      const vid = item.video
        ? el("video", { src: item.video, poster: item.image, muted: true, loop: true, playsinline: true })
        : el("img", { src: item.image, alt: bestTitle });
      if (vid.tagName === "VIDEO") {
        vid.addEventListener("mouseenter", () => vid.play().catch(() => {}));
        vid.addEventListener("mouseleave", () => vid.pause());
        vid.addEventListener("click", () => { if (vid.paused) vid.play().catch(() => {}); else vid.pause(); });
      }
      grid.append(el("article", { class: "trace-card" },
        vid,
        el("div", { class: "body" },
          el("span", { class: "trace-sim" }, "相似度 " + item.similarity + "%"),
          el("div", { class: "t-title-medium w700 clamp-2" }, bestTitle),
          item.titleRomaji && item.titleRomaji !== bestTitle ? el("div", { class: "t-body-small c-variant clamp-1" }, item.titleRomaji) : null,
          el("div", { class: "t-body-small c-variant" },
            (item.episode != null ? "第 " + item.episode + " 话 · " : "") + formatDuration(item.from) + " - " + formatDuration(item.to)
          ),
          el("div", { style: { display: "flex", gap: "8px", marginTop: "auto", paddingTop: "8px", flexWrap: "wrap" } },
            button("Bangumi 搜索", () => go("/search?q=" + encodeURIComponent(bestTitle)), { small: true, icon: "search" }),
            button("规则直搜", () => go("/search?mode=rule&q=" + encodeURIComponent(bestTitle)), { variant: "tonal", small: true, icon: "extension" })
          )
        )
      ));
    }
    resultArea.append(
      el("div", { class: "t-body-small c-variant" }, "已搜索 " + (res.frameCount || 0) + " 帧，悬停或点击预览卡片可播放匹配片段"),
      grid
    );
  }

  urlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") searchByUrl(); });
  body.append(
    fileInput,
    dropzone,
    el("div", { class: "field-row", style: { marginTop: "14px" } }, urlInput, button("通过 URL 搜索", searchByUrl, { variant: "tonal", icon: "search" })),
    resultArea
  );
}

/* ==========================================================================
 * MASTER-DETAIL SETTINGS CENTER (/settings & /settings/:cat)
 * ========================================================================== */
const SETTINGS_GROUPS = [
  {
    group: "播放与弹幕",
    items: [
      { id: "player", label: "播放设置", icon: "play" },
      { id: "danmaku", label: "弹幕与屏蔽词", icon: "subtitles" },
      { id: "keyboard", label: "快捷键设置", icon: "keyboard" },
    ],
  },
  {
    group: "规则与外观",
    items: [
      { id: "plugin", label: "规则仓库", icon: "extension" },
      { id: "theme", label: "外观与配色", icon: "palette" },
    ],
  },
  {
    group: "数据与网络",
    items: [
      { id: "sync", label: "同步与备份", icon: "cloud" },
      { id: "proxy", label: "网络与镜像", icon: "lan" },
      { id: "storage", label: "存储与运行日志", icon: "storage" },
    ],
  },
  {
    group: "其他",
    items: [
      { id: "about", label: "关于 Kazumi-web", icon: "info" },
    ],
  },
];

function renderSettings(app, initialCat) {
  renderNavRail("my");
  let isWide = window.innerWidth >= 840;
  let activeCat = initialCat || (isWide ? "player" : "");

  const barTitle = el("span", {}, "设置");
  const bar = appBar({
    title: barTitle,
    compact: true,
    back: () => {
      if (!isWide && activeCat) {
        go("/settings");
      } else {
        go("/home?tab=my");
      }
    },
  });

  const shell = el("div", { class: "settings-shell" });
  app.append(bar, shell);

  function findCatLabel(id) {
    for (const g of SETTINGS_GROUPS) {
      for (const it of g.items) if (it.id === id) return it.label;
    }
    return "设置";
  }

  function renderLayout() {
    shell.innerHTML = "";
    if (!isWide && !activeCat) {
      barTitle.textContent = "设置";
      shell.append(buildRail());
    } else if (!isWide && activeCat) {
      barTitle.textContent = findCatLabel(activeCat);
      const pane = el("div", { class: "settings-pane" });
      renderCategory(pane, activeCat);
      shell.append(pane);
    } else {
      barTitle.textContent = "设置";
      if (!activeCat) activeCat = "player";
      const pane = el("div", { class: "settings-pane" });
      renderCategory(pane, activeCat);
      shell.append(buildRail(), pane);
    }
  }

  function buildRail() {
    const rail = el("nav", { class: "settings-rail" });
    for (const g of SETTINGS_GROUPS) {
      rail.append(el("div", { class: "settings-group-lbl" }, g.group));
      for (const it of g.items) {
        rail.append(el("button", {
          type: "button",
          class: "settings-rail-btn sl" + (activeCat === it.id ? " is-active" : ""),
          onClick: () => go("/settings/" + it.id),
        }, iconNode(it.icon), el("span", {}, it.label)));
      }
    }
    return rail;
  }

  const onResize = () => {
    const next = window.innerWidth >= 840;
    if (next !== isWide) { isWide = next; renderLayout(); }
  };
  window.addEventListener("resize", onResize);
  registerCleanup(() => window.removeEventListener("resize", onResize));

  async function saveServerSettings(patch, quiet = false) {
    try {
      const updated = await fetchJsonPut("/api/settings", patch);
      Object.assign(APP_SETTINGS, updated);
      if (!quiet) toast("设置已保存");
    } catch (e) { toast(e.message); }
  }

  function renderCategory(pane, cat) {
    pane.innerHTML = "";

    // ---- 1. PLAYER ----
    if (cat === "player") {
      let pp = KazumiStore.getPlayerPrefs();
      const srOpts = [
        { id: "off", label: "关闭" },
        { id: "fast", label: "Anime4K 轻量锐化" },
        { id: "quality", label: "Anime4K 强力超分" },
      ];
      const srChips = el("div", { class: "chips" });
      const drawSr = () => {
        srChips.innerHTML = "";
        for (const o of srOpts) {
          srChips.append(filterChip({ label: o.label, selected: pp.superRes === o.id, onClick: () => { pp = KazumiStore.setPlayerPrefs({ superRes: o.id }); drawSr(); } }));
        }
      };
      drawSr();

      const resolverOpts = [
        { id: "auto", label: "智能双引擎（推荐，最省 Render 内存）" },
        { id: "static", label: "仅静态极速解析（零浏览器内存占用）" },
        { id: "browser", label: "强制 Playwright 无头浏览器嗅探" },
      ];
      const resChips = el("div", { class: "chips" });
      const drawRes = () => {
        resChips.innerHTML = "";
        for (const o of resolverOpts) {
          resChips.append(filterChip({
            label: o.label,
            selected: (APP_SETTINGS.resolverMode || "auto") === o.id,
            onClick: async () => { await saveServerSettings({ resolverMode: o.id }); drawRes(); },
          }));
        }
      };
      drawRes();

      pane.append(
        section("播放器默认行为", splitList([
          switchTile({ title: "自动连播下一集", desc: "当前集播放完毕后 2.4 秒自动切至下一集", checked: pp.autoNext, onChange: (v) => { pp = KazumiStore.setPlayerPrefs({ autoNext: v }); } }),
          switchTile({ title: "自动恢复上次观看进度", checked: pp.autoResume, onChange: (v) => { pp = KazumiStore.setPlayerPrefs({ autoResume: v }); } }),
          sliderTile({ label: "默认播放倍速", min: 0.5, max: 3.0, step: 0.25, value: pp.rate, format: (v) => v.toFixed(2) + "x", onChange: (v) => { pp = KazumiStore.setPlayerPrefs({ rate: v }); } }),
          sliderTile({ label: "跳过片头时长", min: 15, max: 180, step: 5, value: pp.skipSeconds, format: (v) => v + " 秒", onChange: (v) => { pp = KazumiStore.setPlayerPrefs({ skipSeconds: v }); } }),
        ], { tight: true })),
        section("实时画质锐化（Anime4K Web SVG 滤镜）", el("div", { class: "tonal-card" }, srChips)),
        section("视频源解析引擎", el("div", { class: "tonal-card" },
          resChips,
          el("div", { class: "t-body-small c-variant", style: { marginTop: "8px" } }, "智能双引擎优先尝试毫秒级静态提取（不启动 Chromium），仅在站点采用动态 JS 加密时才按需拉起 Playwright 并在闲置 45 秒后自动释放内存。")
        ))
      );
      return;
    }

    // ---- 2. DANMAKU & SHIELDS ----
    if (cat === "danmaku") {
      let dp = KazumiStore.getDanmakuPrefs();
      let shields = KazumiStore.getShields();
      const shieldInput = el("input", { class: "text-field", placeholder: "输入关键词或 /正则表达式/，回车添加" });
      const shieldChips = el("div", { class: "chips", style: { marginTop: "10px" } });

      async function saveShields() {
        KazumiStore.setShields(shields);
        try { await fetchJsonPut("/api/danmaku/shields", { items: shields }); } catch (_) {}
        renderShields();
      }
      function renderShields() {
        shieldChips.innerHTML = "";
        if (!shields.length) {
          shieldChips.append(el("span", { class: "t-body-small c-variant" }, "暂未添加屏蔽规则"));
          return;
        }
        for (const s of shields) {
          shieldChips.append(el("button", {
            type: "button", class: "chip is-selected sl", title: "点击删除",
            onClick: () => { shields = shields.filter((x) => x !== s); saveShields(); },
          }, el("span", {}, s), iconNode("close")));
        }
      }
      const addShield = () => {
        const v = shieldInput.value.trim();
        if (!v || shields.includes(v)) return;
        shields.push(v);
        shieldInput.value = "";
        saveShields();
        toast("已添加弹幕屏蔽词");
      };
      shieldInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addShield(); });
      renderShields();

      const apiDomainInput = el("input", { class: "text-field mono", value: APP_SETTINGS.danmakuApiDomain || "https://api.dandanplay.net", placeholder: "https://api.dandanplay.net" });
      const chSel = el("select", { class: "text-field" },
        el("option", { value: "0" }, "保持原样"),
        el("option", { value: "1" }, "转换为简体中文"),
        el("option", { value: "2" }, "转换为繁体中文")
      );
      chSel.value = String(APP_SETTINGS.danmakuChConvert || 0);
      chSel.addEventListener("change", () => saveServerSettings({ danmakuChConvert: Number(chSel.value) }));

      pane.append(
        section("弹幕默认样式", splitList([
          switchTile({ title: "默认开启弹幕", checked: dp.enabled, onChange: (v) => { dp = KazumiStore.setDanmakuPrefs({ enabled: v }); } }),
          sliderTile({ label: "默认字号", min: 14, max: 36, step: 1, value: dp.fontSize, format: (v) => v + "px", onChange: (v) => { dp = KazumiStore.setDanmakuPrefs({ fontSize: v }); } }),
          sliderTile({ label: "默认不透明度", min: 0.2, max: 1.0, step: 0.05, value: dp.opacity, format: (v) => Math.round(v * 100) + "%", onChange: (v) => { dp = KazumiStore.setDanmakuPrefs({ opacity: v }); } }),
          sliderTile({ label: "滚动时长", min: 5, max: 16, step: 1, value: dp.speed, format: (v) => v + " 秒", onChange: (v) => { dp = KazumiStore.setDanmakuPrefs({ speed: v }); } }),
          sliderTile({ label: "最大显示区域", min: 0.25, max: 1.0, step: 0.25, value: dp.area, format: (v) => Math.round(v * 100) + "%", onChange: (v) => { dp = KazumiStore.setDanmakuPrefs({ area: v }); } }),
          switchTile({ title: "智能合并重复弹幕", checked: dp.mergeDuplicate, onChange: (v) => { dp = KazumiStore.setDanmakuPrefs({ mergeDuplicate: v }); } }),
          switchTile({ title: "字体加粗", checked: dp.bold, onChange: (v) => { dp = KazumiStore.setDanmakuPrefs({ bold: v }); } }),
          switchTile({ title: "文字描边", checked: dp.stroke, onChange: (v) => { dp = KazumiStore.setDanmakuPrefs({ stroke: v }); } }),
        ], { tight: true })),

        section("弹幕屏蔽词管理（支持 /正则/）", el("div", { class: "tonal-card" },
          el("div", { class: "field-row", style: { marginTop: 0 } }, shieldInput, button("添加", addShield, { small: true, icon: "add" })),
          shieldChips
        )),

        section("弹弹play 接口配置", el("div", { class: "tonal-card" },
          el("div", { class: "field-group" },
            el("div", { class: "field-label" }, "弹幕服务域名（可填自建弹幕代理）"),
            el("div", { class: "field-row", style: { marginTop: 0 } },
              apiDomainInput,
              button("保存", () => saveServerSettings({ danmakuApiDomain: apiDomainInput.value.trim() }), { small: true })
            )
          ),
          el("div", { class: "field-group", style: { marginBottom: 0 } },
            el("div", { class: "field-label" }, "繁简转换"),
            chSel
          )
        ))
      );
      return;
    }

    // ---- 3. KEYBOARD SHORTCUTS ----
    if (cat === "keyboard") {
      let sc = KazumiStore.getShortcuts();
      const formatKey = (k) => k === " " ? "Space" : (k || "未绑定");
      const rows = Object.keys(SHORTCUT_LABELS).map((actionKey) => {
        const pill = el("span", { class: "kbd-pill" }, formatKey(sc[actionKey]));
        return splitRow(tile({
          title: SHORTCUT_LABELS[actionKey],
          trailing: pill,
          onClick: () => {
            pill.textContent = "请按下按键…";
            const handler = (e) => {
              e.preventDefault();
              e.stopPropagation();
              window.removeEventListener("keydown", handler, true);
              if (e.key === "Escape") { pill.textContent = formatKey(sc[actionKey]); return; }
              sc[actionKey] = e.key;
              KazumiStore.setShortcuts(sc);
              pill.textContent = formatKey(e.key);
              toast("已绑定「" + SHORTCUT_LABELS[actionKey] + "」→ " + formatKey(e.key));
            };
            window.addEventListener("keydown", handler, true);
          },
        }));
      });
      pane.append(
        section("播放器快捷键（点击条目后按下新按键即可重绑定）", splitList(rows, { tight: true })),
        button("恢复全部默认快捷键", () => {
          KazumiStore.resetShortcuts();
          toast("已恢复默认快捷键");
          renderCategory(pane, "keyboard");
        }, { variant: "tonal", icon: "refresh" })
      );
      return;
    }

    // ---- 4. PLUGIN / RULES REPO ----
    if (cat === "plugin") {
      const repoInput = el("input", { class: "text-field mono", value: APP_SETTINGS.ruleRepositoryUrl || "", placeholder: "留空使用官方 Predidit/KazumiRules（支持镜像）" });
      pane.append(
        section("规则工具", splitList([
          splitRow(tile({ badgeIcon: "extension", title: "规则管理与排序", desc: "查看、导入、排序与分享 kazumi:// 规则", chevron: true, onClick: () => go("/my/rules") })),
          splitRow(tile({ badgeIcon: "store", title: "官方规则仓库", desc: "浏览并一键安装 KazumiRules 源站规则", chevron: true, onClick: () => go("/my/rules?shop=1") })),
          splitRow(tile({ badgeIcon: "edit", title: "可视化规则编辑器", desc: "创建或修改自定义 XPath / API 规则", chevron: true, onClick: () => go("/my/rules/edit") })),
          splitRow(tile({ badgeIcon: "bug_report", title: "规则在线测试器", desc: "逐级诊断搜索、选集与视频流解析", chevron: true, onClick: () => go("/my/rules/test") })),
        ], { tight: true })),
        section("自定义规则仓库地址", el("div", { class: "tonal-card" },
          el("div", { class: "field-row", style: { marginTop: 0 } },
            repoInput,
            button("保存", () => saveServerSettings({ ruleRepositoryUrl: repoInput.value.trim() }), { small: true })
          ),
          el("div", { class: "t-body-small c-variant", style: { marginTop: "8px" } }, "需要指向包含 index.json 的 Raw 仓库目录 URL。")
        ))
      );
      return;
    }

    // ---- 5. THEME (9 OFFICIAL PALETTES + DARK + OLED) ----
    if (cat === "theme") {
      let tp = getThemePrefs();
      const modeChips = el("div", { class: "chips" });
      const drawModes = () => {
        modeChips.innerHTML = "";
        for (const [id, lbl] of Object.entries(THEME_MODE_LABELS)) {
          modeChips.append(filterChip({
            label: lbl,
            selected: tp.mode === id,
            onClick: () => { setThemePrefs({ mode: id }); tp = getThemePrefs(); drawModes(); },
          }));
        }
      };
      drawModes();

      const paletteGrid = el("div", { class: "palette-grid" });
      const drawPalettes = () => {
        paletteGrid.innerHTML = "";
        for (const p of KAZUMI_COLOR_THEMES) {
          const sel = tp.colorId === p.id;
          paletteGrid.append(el("button", {
            type: "button",
            class: "palette-card sl" + (sel ? " is-selected" : ""),
            onClick: () => { setThemePrefs({ colorId: p.id }); tp = getThemePrefs(); drawPalettes(); },
          },
            el("span", { class: "palette-swatch", style: { background: p.seed } }, sel ? iconNode("check") : null),
            el("span", { class: "t-label-large" }, p.label)
          ));
        }
      };
      drawPalettes();

      pane.append(
        section("明暗模式", el("div", { class: "tonal-card" }, modeChips)),
        section("OLED 深色增强", splitList([
          switchTile({
            title: "纯黑 OLED 深色背景",
            desc: "深色模式下将背景色替换为 #000000，更省电且观影更沉浸",
            checked: tp.oled,
            onChange: (v) => { setThemePrefs({ oled: v }); tp = getThemePrefs(); },
          }),
        ])),
        section("Kazumi 官方主题配色（9 套 Material 3 Expressive 调色板）", paletteGrid)
      );
      return;
    }

    // ---- 6. SYNC & BACKUP (JSON / WebDAV / Bangumi Account) ----
    if (cat === "sync") {
      const importFile = el("input", { type: "file", accept: ".json", style: { display: "none" } });
      importFile.addEventListener("change", async () => {
        const f = importFile.files && importFile.files[0];
        if (!f) return;
        try {
          const parsed = JSON.parse(await f.text());
          KazumiStore.applyFullBackup(parsed);
          await fetchJsonPost("/api/sync/import", Object.assign({}, parsed, { overwrite: true }));
          toast("备份已恢复并同步至服务器与浏览器本地");
        } catch (e) { toast("恢复失败：" + e.message); }
      });

      const wdUrl = el("input", { class: "text-field mono", value: APP_SETTINGS.webdavUrl || "", placeholder: "https://dav.jianguoyun.com/dav" });
      const wdUser = el("input", { class: "text-field", value: APP_SETTINGS.webdavUsername || "", placeholder: "WebDAV 账号" });
      const wdPass = el("input", { class: "text-field", type: "password", value: APP_SETTINGS.webdavPassword || "", placeholder: "应用专用密码" });
      const wdPath = el("input", { class: "text-field mono", value: APP_SETTINGS.webdavPath || "/kazumiSync", placeholder: "/kazumiSync" });

      const getWdBody = () => ({ url: wdUrl.value.trim(), username: wdUser.value.trim(), password: wdPass.value, path: wdPath.value.trim() || "/kazumiSync" });

      const bgmToken = el("input", { class: "text-field mono", type: "password", value: APP_SETTINGS.bangumiToken || "", placeholder: "从 next.bgm.tv/demo/access-token 获取" });

      pane.append(
        section("本地 JSON 完整备份（规则 + 追番 + 历史 + 弹幕屏蔽 + 偏好）", el("div", { class: "tonal-card" },
          el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } },
            importFile,
            button("导出 JSON 备份", () => {
              const data = KazumiStore.buildFullBackup();
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "kazumi_web_backup_" + new Date().toISOString().slice(0, 10) + ".json";
              a.click();
              toast("已导出备份文件");
            }, { icon: "download" }),
            button("导入 JSON 恢复", () => importFile.click(), { variant: "tonal", icon: "upload" })
          )
        )),

        section("WebDAV 云同步（服务端直连，无浏览器跨域限制）", el("div", { class: "tonal-card" },
          el("div", { class: "field-group" }, el("div", { class: "field-label" }, "WebDAV 地址"), wdUrl),
          el("div", { class: "field-row" },
            el("div", { class: "field-group", style: { flex: 1 } }, el("div", { class: "field-label" }, "用户名"), wdUser),
            el("div", { class: "field-group", style: { flex: 1 } }, el("div", { class: "field-label" }, "密码 / 应用密码"), wdPass)
          ),
          el("div", { class: "field-group" }, el("div", { class: "field-label" }, "远端目录"), wdPath),
          el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
            button("保存配置", () => saveServerSettings({
              webdavUrl: wdUrl.value.trim(),
              webdavUsername: wdUser.value.trim(),
              webdavPassword: wdPass.value,
              webdavPath: wdPath.value.trim() || "/kazumiSync",
            }), { variant: "surface", small: true }),
            button("测试连接", async () => {
              try { await fetchJsonPost("/api/webdav/test", getWdBody()); toast("WebDAV 连接测试成功！"); }
              catch (e) { toast(e.message); }
            }, { variant: "tonal", small: true, icon: "check" }),
            button("上传备份", async () => {
              try {
                const res = await fetchJsonPost("/api/webdav/upload", Object.assign(getWdBody(), { backup: KazumiStore.buildFullBackup() }));
                toast("已上传至 WebDAV（" + Math.round((res.bytes || 0) / 1024) + " KB）");
              } catch (e) { toast(e.message); }
            }, { small: true, icon: "upload" }),
            button("从云端下载合并", async () => {
              try {
                const res = await fetchJsonPost("/api/webdav/download", getWdBody());
                if (res.backup) KazumiStore.applyFullBackup(res.backup);
                toast("已从 WebDAV 合并同步！");
              } catch (e) { toast(e.message); }
            }, { variant: "tonal", small: true, icon: "download" })
          )
        )),

        section("Bangumi 账号双向同步", el("div", { class: "tonal-card" },
          el("div", { class: "field-group" },
            el("div", { class: "field-label" }, "Bangumi Access Token" + (APP_SETTINGS.bangumiUsername ? "（当前已绑定：" + APP_SETTINGS.bangumiUsername + "）" : "")),
            bgmToken
          ),
          el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" } },
            button("验证并绑定", async () => {
              try {
                const res = await fetchJsonPost("/api/bangumi/account/verify", { token: bgmToken.value.trim() });
                APP_SETTINGS.bangumiToken = bgmToken.value.trim();
                APP_SETTINGS.bangumiUsername = res.user && res.user.username;
                toast("绑定成功：" + ((res.user && res.user.nickname) || APP_SETTINGS.bangumiUsername));
                renderCategory(pane, "sync");
              } catch (e) { toast(e.message); }
            }, { small: true, icon: "key" }),
            button("拉取 Bangumi 追番列表", async () => {
              toast("正在拉取 Bangumi 收藏…");
              try {
                const res = await fetchJsonPost("/api/bangumi/account/pull", { token: bgmToken.value.trim() });
                if (res.items) KazumiStore.setCollectsFromList(res.items);
                toast("已拉取并合并 " + (res.count || 0) + " 部 Bangumi 追番");
              } catch (e) { toast(e.message); }
            }, { variant: "tonal", small: true, icon: "sync" })
          ),
          splitList([
            switchTile({
              title: "修改追番状态时自动同步至 Bangumi",
              checked: !!APP_SETTINGS.bangumiAutoSync,
              onChange: (v) => saveServerSettings({ bangumiAutoSync: v }),
            }),
          ])
        ))
      );
      return;
    }

    // ---- 7. PROXY & MIRRORS ----
    if (cat === "proxy") {
      const proxyInput = el("input", { class: "text-field mono", value: APP_SETTINGS.proxyUrl || "", placeholder: "http://127.0.0.1:7890 或 socks5://..." });
      pane.append(
        section("内置加速镜像", splitList([
          switchTile({ title: "Bangumi API 镜像 (api.kazumi.fyi)", desc: "服务端访问 Bangumi 受限时开启", checked: !!APP_SETTINGS.enableBangumiProxy, onChange: (v) => saveServerSettings({ enableBangumiProxy: v }) }),
          switchTile({ title: "Bangumi 封面图加速镜像", desc: "将浏览器加载的 lain.bgm.tv 封面自动切换为镜像站", checked: getImageMirror(), onChange: (v) => { setImageMirror(v); toast("已切换图片镜像"); } }),
          switchTile({ title: "GitHub 规则仓库镜像加速", desc: "优先经镜像拉取 Predidit/KazumiRules", checked: !!APP_SETTINGS.enableGitProxy, onChange: (v) => saveServerSettings({ enableGitProxy: v }) }),
        ], { tight: true })),
        section("自定义出站代理（HTTP / SOCKS5）", splitList([
          switchTile({ title: "启用服务端出站代理", checked: !!APP_SETTINGS.proxyEnable, onChange: (v) => saveServerSettings({ proxyEnable: v }) }),
          splitRow(el("div", { style: { padding: "12px 16px" } },
            el("div", { class: "field-row", style: { marginTop: 0 } },
              proxyInput,
              button("保存代理", () => saveServerSettings({ proxyUrl: proxyInput.value.trim() }), { small: true })
            )
          )),
        ], { tight: true }))
      );
      return;
    }

    // ---- 8. STORAGE & LIVE SERVER LOGS ----
    if (cat === "storage") {
      const kb = (KazumiStore.estimateLocalStorageBytes() / 1024).toFixed(1);
      const logBox = el("div", { class: "log-box" }, "正在加载服务端运行日志…");
      let logFilter = "ALL";

      async function loadLogs() {
        try {
          const res = await fetchJson("/api/logs");
          const items = (res.items || []).filter((x) => logFilter === "ALL" || x.level === logFilter);
          logBox.innerHTML = "";
          if (!items.length) { logBox.textContent = "暂无日志"; return; }
          for (const l of items.slice().reverse()) {
            logBox.append(el("div", { class: "log-line lvl-" + l.level },
              "[" + new Date(l.ts).toLocaleTimeString() + "] [" + l.level + "] " + l.message
            ));
          }
        } catch (e) { logBox.textContent = "日志加载失败：" + e.message; }
      }

      pane.append(
        section("Render 混合持久化状态", splitList([
          splitRow(tile({
            badgeIcon: "storage",
            title: "浏览器本地持久化镜像",
            desc: "已占用 " + kb + " KB · Render 免费容器休眠重启后自动无缝回填规则、追番与观看进度",
            trailing: button("立即同步", async () => { await KazumiStore.syncWithServer(); toast("已完成双向持久化同步"); }, { variant: "tonal", small: true }),
          })),
          splitRow(tile({
            icon: "delete",
            title: "清空搜索历史",
            onClick: () => { localStorage.removeItem("kazumi_search_hist"); toast("已清空搜索历史"); },
          })),
        ], { tight: true })),
        section("服务端实时诊断日志", el("div", {},
          el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" } },
            ...["ALL", "INFO", "WARNING", "ERROR"].map((lvl) => filterChip({
              label: lvl,
              noCheck: true,
              onClick: () => { logFilter = lvl; loadLogs(); },
            })),
            button("刷新", loadLogs, { variant: "tonal", small: true, icon: "refresh" }),
            button("清空", async () => { await fetchJsonDelete("/api/logs"); loadLogs(); toast("日志已清空"); }, { variant: "surface", small: true, icon: "delete" })
          ),
          logBox
        ))
      );
      loadLogs();
      return;
    }

    // ---- 9. ABOUT ----
    if (cat === "about") {
      const infoCard = el("div", { class: "tonal-card about-card" }, inlineLoading("加载运行环境信息…"));
      pane.append(section("关于 Kazumi-web", infoCard));
      fetchJson("/api/about").then((info) => {
        infoCard.innerHTML = "";
        infoCard.append(
          el("div", { style: { display: "flex", alignItems: "center", gap: "14px", marginBottom: "8px" } },
            el("img", { src: "/assets/icon-192.png", style: { width: "56px", height: "56px", borderRadius: "16px" }, alt: "Kazumi" }),
            el("div", {},
              el("div", { class: "t-title-large w700" }, "Kazumi-web v" + (info.version || "2.4.6")),
              el("div", { class: "t-body-small c-variant" }, "基于 Predidit/Kazumi 完整移植的 Render 云端自适应 Web 版")
            )
          ),
          el("div", { class: "t-body-medium" }, "Playwright 浏览器解析：" + (info.playwrightEnabled ? "已启用（按需启停）" : "未启用（纯静态解析模式）")),
          el("div", { class: "t-body-medium" }, "访问口令保护：" + (info.authEnabled ? "已开启" : "未开启（公开访问）")),
          el("div", { class: "t-body-medium" }, "当前规则数量：" + (info.rulesCount || 0) + " 条"),
          el("div", { class: "t-body-small c-variant", style: { marginTop: "6px" } }, "开源协议：GNU General Public License v3.0 (GPL-3.0)"),
          el("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "8px" } },
            el("a", { href: info.repository || "https://github.com/Simoon1218/Kazumi-web", target: "_blank", rel: "noopener", class: "about-link" }, "Kazumi-web 仓库"),
            el("a", { href: info.upstream || "https://github.com/Predidit/Kazumi", target: "_blank", rel: "noopener", class: "about-link" }, "上游原项目 Predidit/Kazumi")
          ),
          AUTH_STATE.authEnabled ? el("div", { style: { marginTop: "12px" } },
            button("退出登录锁定", async () => {
              await fetchJsonPost("/api/auth/logout", {});
              location.reload();
            }, { variant: "danger", small: true, icon: "lock" })
          ) : null
        );
      }).catch((e) => {
        infoCard.innerHTML = "";
        infoCard.append(errorState(e, null, { compact: true }));
      });
    }
  }

  renderLayout();
}

/* ==========================================================================
 * Kick off application once all scripts (theme, store, app, player, extra)
 * have been evaluated.
 * ========================================================================== */
bootstrapApp();
