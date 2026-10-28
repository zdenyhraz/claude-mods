import type { ClientModule } from 'claude-code'

// What a click on a file asks for: the file itself, its diff, or the person's editor.
export type OpenMode = 'file' | 'diff' | 'editor'

// An empty layer over a file's row, drawn as an image the pointer cannot press, that tells the hooks module which
// file was clicked and how: a plain click, shift for the diff, ctrl for the editor.
const FileClick: ClientModule<{ path: string }, boolean> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.onPointer(event => {
      if (event.type === 'up' && event.button === 'left') {
        const mode: OpenMode = event.ctrl === true ? 'editor' : event.shift === true ? 'diff' : 'file'
        surface.post({ path: props.path, mode })
      }
    })
    surface.setState(true)
  }

  return (
    <Box width="100%" height="100%">
      <Text> </Text>
    </Box>
  )
}

export default FileClick
