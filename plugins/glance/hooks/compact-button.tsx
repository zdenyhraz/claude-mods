import type { ClientModule } from 'claude-code'

// `ready` compacts on a click; `queued` waits for the running turn to end; `compacting` is under way.
export type CompactMode = 'ready' | 'queued' | 'compacting'

// A word in the theme's warning colour that asks the hooks module to compact when clicked; the app's native
// button would draw its own colour over it. It inverts under the pointer, as a button does.
const CompactButton: ClientModule<{ mode: CompactMode }, { isHovered: boolean }> = (props, surface) => {
  const { Text } = surface.elements

  if (surface.state === undefined) {
    surface.onPointer(event => {
      if (event.type === 'enter' || event.type === 'leave') {
        surface.setState({ isHovered: event.type === 'enter' })
      } else if (event.type === 'up' && event.button === 'left') {
        surface.post({ action: 'compact' })
      }
    })
    surface.setState({ isHovered: false })
  }

  if (props.mode === 'compacting') {
    return <Text dimColor> … </Text>
  }

  return (
    <Text color="warning" bold inverse={surface.state?.isHovered === true} dimColor={props.mode === 'queued'}>
      {' compact '}
    </Text>
  )
}

export default CompactButton
