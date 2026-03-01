import Titlebar from './components/Titlebar'

function App(): JSX.Element {
  return (
    <div className="app">
      <Titlebar onSettingsClick={() => {}} />
      <div className="app-content"></div>
    </div>
  )
}

export default App
