import { Paper } from './paper/Paper'
import { longTest } from './sample/longTest'
import { sampleTest } from './sample/sampleTest'

const test = new URLSearchParams(location.search).get('sample') === 'long' ? longTest : sampleTest

export function App() {
  return (
    <div className="app">
      <header className="app-bar">
        <b>国語テストつくるくん</b>
        <span>サンプルのテストを表示しています</span>
      </header>
      <Paper test={test} />
    </div>
  )
}
