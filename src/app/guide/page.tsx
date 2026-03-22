"use client";

import { useRouter } from "next/navigation";

export default function GuidePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-sm">
                M
              </div>
              <h1 className="text-base font-semibold tracking-tight">MOG 集計 - 使い方ガイド</h1>
            </div>
            <button
              onClick={() => router.push("/")}
              className="px-3 py-1.5 text-xs text-gray-300 bg-gray-800 rounded-lg hover:text-white hover:bg-gray-700 transition-all"
            >
              案件一覧に戻る
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="space-y-10">

          {/* スプレッドシート反映 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 pb-2 border-b-2 border-blue-500 mb-5">
              スプレッドシート反映の使い方
            </h2>

            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-3">初回のみ: Googleアカウント連携</h3>
                <ol className="space-y-2 text-sm text-gray-700">
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                    <span>画面上部の「<strong>スプレッドシート反映</strong>」ボタンをクリック</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    <span>「<strong>Googleアカウント連携</strong>」ボタンをクリック</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                    <span>スプレッドシートにアクセスできるGoogleアカウントでログイン</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                    <span>「<strong>Google連携済み</strong>」と表示されれば完了（次回以降は不要）</span>
                  </li>
                </ol>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-3">毎日の作業: データ反映</h3>
                <ol className="space-y-2 text-sm text-gray-700">
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                    <span>「<strong>スプレッドシート反映</strong>」ボタンをクリックしてパネルを開く</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    <span>スプレッドシートのURLを貼り付け</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                    <span>日付範囲を設定（通常は<strong>過去3日分</strong>くらいでOK）</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                    <span>「<strong>反映</strong>」ボタンをクリック</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold">5</span>
                    <span>完了すると結果が表示される（書き込まれたセルは水色になります）</span>
                  </li>
                </ol>
              </div>

              <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
                <h3 className="text-sm font-bold text-amber-800 mb-2">注意点</h3>
                <ul className="space-y-1.5 text-sm text-amber-700">
                  <li>- 「反映」を押すとMeta / CATSから最新データを取得してから書き込みます</li>
                  <li>- 日付範囲を長くしすぎるとタイムアウトする場合があります</li>
                  <li>- 書き込まれるのは<strong>広告費・imp・クリック・MCV・CV</strong>の5項目のみ</li>
                  <li>- ROAS・粗利・売上などはスプレッドシートの数式で自動計算されます</li>
                  <li>- 万一ミスがあっても、スプレッドシートの「変更履歴」から復元できます</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 命名規則 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 pb-2 border-b-2 border-blue-500 mb-5">
              命名規則ガイド
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              このツールは、Meta・CATS・TikTokの命名規則をもとに案件を自動で紐づけています。
              以下のルールを守らないと、データが正しく集計されません。
            </p>

            {/* Meta広告アカウント名 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-100 text-blue-700">Meta</span>
                <h3 className="text-sm font-bold text-gray-900">広告アカウント名</h3>
              </div>
              <div className="bg-gray-900 text-emerald-400 rounded-lg px-4 py-3 text-sm font-mono mb-3">
                通し番号：クライアント名_メニュー名
              </div>
              <div className="space-y-1 text-sm text-gray-600 mb-3">
                <p className="font-medium text-gray-800">例:</p>
                <p className="font-mono text-xs bg-gray-50 rounded px-2 py-1">001：シーズ・ラボ_レディース毛穴</p>
                <p className="font-mono text-xs bg-gray-50 rounded px-2 py-1">002：ビューティス_クマ取り</p>
                <p className="font-mono text-xs bg-gray-50 rounded px-2 py-1">020：ダンディハウス_フェイシャル</p>
              </div>
              <ul className="space-y-1 text-xs text-gray-500">
                <li>- 先頭に半角数字の通し番号をつける</li>
                <li>- <strong>：</strong>（全角コロン）または <strong>:</strong>（半角コロン）で区切る</li>
                <li>- クライアント名とメニュー名は <strong>_</strong>（アンダースコア）で区切る</li>
                <li>- メニューが1つしかないクライアントはメニュー名を省略してOK</li>
                <li>- 転生アカウントは末尾に（転生）をつけてOK</li>
              </ul>
            </div>

            {/* CATS媒体名 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-100 text-purple-700">CATS</span>
                <h3 className="text-sm font-bold text-gray-900">媒体名</h3>
              </div>
              <div className="bg-gray-900 text-emerald-400 rounded-lg px-4 py-3 text-sm font-mono mb-3">
                【プラットフォーム】クライアント名_メニュー名_ビジマネ名_コード番号
              </div>
              <div className="space-y-1 text-sm text-gray-600 mb-3">
                <p className="font-medium text-gray-800">例:</p>
                <p className="font-mono text-xs bg-gray-50 rounded px-2 py-1">【Meta_API】シーズ・ラボ_レディース毛穴_美容のススメ_01</p>
                <p className="font-mono text-xs bg-gray-50 rounded px-2 py-1">【TikTok_API】ビューティス_エリシスセンス_MOG_05</p>
              </div>
              <ul className="space-y-1 text-xs text-gray-500">
                <li>- <strong>【】</strong>内にプラットフォーム名（MetaまたはTikTokを含む文字列）</li>
                <li>- クライアント名・メニュー名は<strong>Metaアカウント名と同じ表記</strong>にする</li>
                <li>- <strong>コード番号は必ず末尾</strong>に半角数字でつける</li>
                <li>- 担当者名をつける場合は末尾に（担当者名）を追加してOK</li>
              </ul>
            </div>

            {/* Metaキャンペーン名 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-100 text-blue-700">Meta</span>
                <h3 className="text-sm font-bold text-gray-900">キャンペーン名</h3>
              </div>
              <div className="bg-gray-900 text-emerald-400 rounded-lg px-4 py-3 text-sm font-mono mb-3">
                任意の名前_<span className="text-yellow-300">コードN</span>_任意の説明
              </div>
              <div className="space-y-1 text-sm text-gray-600 mb-3">
                <p className="font-medium text-gray-800">例:</p>
                <p className="font-mono text-xs bg-gray-50 rounded px-2 py-1">0106_<strong>コード1</strong>_新素材</p>
                <p className="font-mono text-xs bg-gray-50 rounded px-2 py-1"><strong>コード2</strong>_0120_新規素材</p>
                <p className="font-mono text-xs bg-gray-50 rounded px-2 py-1">押切_シーズラボ_痩身_<strong>コード3</strong>_テスト</p>
              </div>
              <ul className="space-y-1 text-xs text-gray-500">
                <li>- キャンペーン名の<strong>どこかに「コード」+半角数字</strong>を含める</li>
                <li>- 位置は先頭・中間・末尾のどこでもOK</li>
                <li>- <strong>これがないキャンペーンは集計対象になりません</strong></li>
              </ul>
            </div>

            {/* NGパターン */}
            <div className="bg-red-50 rounded-xl border border-red-200 p-5">
              <h3 className="text-sm font-bold text-red-800 mb-3">やってはいけないこと</h3>
              <div className="space-y-2">
                {[
                  { ng: "Metaアカウント名に通し番号がない", reason: "システムが名前を読み取れない" },
                  { ng: "CATS媒体名に【】がない", reason: "プラットフォームを判定できない" },
                  { ng: "CATS媒体名の末尾にコード番号がない", reason: "コードを特定できない" },
                  { ng: "キャンペーン名に「コード」がない", reason: "集計対象にならない" },
                  { ng: "クライアント名の表記ゆれ（シーズラボ vs シーズ・ラボ）", reason: "案件の紐づけに失敗する可能性" },
                  { ng: "CATS媒体名のビジマネ名がMetaのビジマネと不一致", reason: "案件が正しく紐づかない" },
                ].map((item, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="text-red-500 font-bold flex-shrink-0">NG</span>
                    <div>
                      <span className="text-red-800 font-medium">{item.ng}</span>
                      <span className="text-red-600 ml-2">→ {item.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 売上の手入力 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 pb-2 border-b-2 border-blue-500 mb-5">
              売上の手入力
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-700 mb-3">
                各案件の集計表で、売上列をクリックすると手入力で上書きできます。
              </p>
              <ul className="space-y-1.5 text-sm text-gray-600">
                <li>- 売上列には鉛筆アイコンが表示されています</li>
                <li>- クリックすると入力欄が表示されます</li>
                <li>- Enterキーで保存、Escキーでキャンセル</li>
                <li>- 手入力した値は青色で表示されます</li>
                <li>- 空欄にすると自動計算（CV x 単価）に戻ります</li>
              </ul>
            </div>
          </section>

          {/* 単価設定 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 pb-2 border-b-2 border-blue-500 mb-5">
              単価の設定
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-700 mb-3">
                案件一覧画面で、各案件の「単価未設定」または「単価 ¥xx」をクリックすると、その場で単価を設定・変更できます。
              </p>
              <ul className="space-y-1.5 text-sm text-gray-600">
                <li>- 単価を設定すると、売上が「CV x 単価」で自動計算されます</li>
                <li>- 粗利やROASも自動で反映されます</li>
              </ul>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
